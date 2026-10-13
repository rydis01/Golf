package se.golf;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executors;

public final class Main {
    private static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES).enable(DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES);
    private static final WeatherService WEATHER = new WeatherService(JSON);
    private static final CourseService COURSES = new CourseService(JSON);
    private static final Path WEB = Path.of(System.getenv().getOrDefault("GOLF_WEB_ROOT", "mobile/www")).toAbsolutePath().normalize();
    private static final Set<String> ORIGINS = Set.of(System.getenv().getOrDefault("GOLF_ALLOWED_ORIGINS", "capacitor://localhost,http://localhost,https://localhost").split(","));
    public static void main(String[] args) throws IOException {
        int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
        HttpServer server = HttpServer.create(new InetSocketAddress(System.getenv().getOrDefault("GOLF_BIND", "127.0.0.1"), port), 0);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.createContext("/", Main::handle);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(1)));
        server.start();
        System.out.println("Golf Caddie started on port " + port + "; web root: " + WEB);
    }
    private static void handle(HttpExchange ex) throws IOException {
        try {
            String origin = ex.getRequestHeaders().getFirst("Origin");
            if (origin != null && ORIGINS.contains(origin)) {
                ex.getResponseHeaders().set("Access-Control-Allow-Origin", origin);
                ex.getResponseHeaders().set("Vary", "Origin");
                ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
                ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            }
            if (ex.getRequestMethod().equals("OPTIONS")) { ex.sendResponseHeaders(204, -1); return; }
            String path = ex.getRequestURI().getPath();
            if (path.startsWith("/api/")) {
                if (path.equals("/api/shot")) {
                    if (!ex.getRequestMethod().equals("POST")) { respond(ex, 405, Map.of("error", "Använd POST.")); return; }
                    byte[] body = ex.getRequestBody().readNBytes(16_385);
                    if (body.length > 16_384) { respond(ex, 413, Map.of("error", "För stor begäran.")); return; }
                    var request = JSON.readTree(body);
                    if (request instanceof com.fasterxml.jackson.databind.node.ObjectNode object) {
                        for (String field : List.of("flightTime", "descentAngle", "uncertainty")) if (!object.has(field)) object.putNull(field);
                        if (object.get("uncertainty") instanceof com.fasterxml.jackson.databind.node.ObjectNode uncertainty) {
                            for (String field : List.of("distance", "elevation", "windDirection")) if (!uncertainty.has(field)) uncertainty.putNull(field);
                        }
                    }
                    respond(ex, 200, ShotCalculator.calculate(JSON.treeToValue(request, ShotCalculator.Shot.class)));
                } else if (!ex.getRequestMethod().equals("GET")) {
                    respond(ex, 405, Map.of("error", "Använd GET."));
                } else switch (path) {
                    case "/api/health" -> respond(ex, 200, Map.of("status", "ok", "model", "wind-v3", "java", Runtime.version().feature()));
                    case "/api/course" -> respond(ex, 200, COURSES.load());
                    case "/api/weather" -> {
                        Map<String, String> q = query(ex);
                        respond(ex, 200, WEATHER.forecast(number(q, "lat"), number(q, "lon")));
                    }
                    case "/api/elevation" -> {
                        Map<String, String> q = query(ex);
                        respond(ex, 200, WEATHER.elevation(number(q, "lat"), number(q, "lon"), number(q, "targetLat"), number(q, "targetLon")));
                    }
                    default -> respond(ex, 404, Map.of("error", "Okänd endpoint."));
                }
            } else {
                if (!ex.getRequestMethod().equals("GET") && !ex.getRequestMethod().equals("HEAD")) { respond(ex, 405, Map.of("error", "Använd GET.")); return; }
                Path file = WEB.resolve(path.equals("/") ? "index.html" : path.substring(1)).normalize();
                if (!file.startsWith(WEB) || !Files.isRegularFile(file) || !file.toRealPath().startsWith(WEB.toRealPath())) {
                    respond(ex, 404, Map.of("error", "Sidan finns inte.")); return;
                }
                String type = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".png") ? "image/png" : path.endsWith(".json") ? "application/json" : "text/html";
                byte[] bytes = Files.readAllBytes(file);
                ex.getResponseHeaders().set("Content-Type", type + (type.startsWith("text/") ? "; charset=utf-8" : ""));
                ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
                if (ex.getRequestMethod().equals("HEAD")) ex.sendResponseHeaders(200, -1);
                else { ex.sendResponseHeaders(200, bytes.length); ex.getResponseBody().write(bytes); }
            }
        } catch (IllegalArgumentException | com.fasterxml.jackson.core.JsonProcessingException e) {
            respond(ex, 400, Map.of("error", e instanceof IllegalArgumentException ? e.getMessage() : "Ogiltig indata. Kontrollera alla fält."));
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt(); respond(ex, 503, Map.of("error", "Förfrågan avbröts. Försök igen."));
        } catch (IOException e) {
            respond(ex, 502, Map.of("error", "Datakällan kunde inte nås eller saknade användbara data. Kontrollera nätverksåtkomst; ange värden manuellt så länge."));
        } catch (Exception e) {
            System.err.println("Request failed: " + e.getClass().getSimpleName());
            respond(ex, 500, Map.of("error", "Ett oväntat fel uppstod."));
        } finally { ex.close(); }
    }
    private static void respond(HttpExchange ex, int status, Object body) throws IOException {
        byte[] bytes = JSON.writeValueAsBytes(body);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, bytes.length); ex.getResponseBody().write(bytes);
    }
    private static Map<String, String> query(HttpExchange ex) {
        Map<String, String> values = new HashMap<>(); String query = ex.getRequestURI().getRawQuery();
        if (query != null) for (String pair : query.split("&")) {
            String[] bits = pair.split("=", 2);
            if (bits.length == 2) values.put(URLDecoder.decode(bits[0], StandardCharsets.UTF_8), URLDecoder.decode(bits[1], StandardCharsets.UTF_8));
        }
        return values;
    }
    private static double number(Map<String, String> q, String key) {
        if (!q.containsKey(key)) throw new IllegalArgumentException("Saknat fält: " + key);
        return Double.parseDouble(q.get(key));
    }
}
