package se.golf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Imports actual OSM geometries. It deliberately does not manufacture missing hole layouts. */
public final class CourseService {
    private final ObjectMapper json;
    private final HttpClient client = NetworkClients.create();
    private final Path cache = Path.of(".runtime/national-courses.json");
    public CourseService(ObjectMapper json) { this.json = json; }
    public synchronized JsonNode load() throws IOException, InterruptedException {
        if (Files.isRegularFile(cache) && Files.getLastModifiedTime(cache).toInstant().isAfter(Instant.now().minus(Duration.ofDays(7)))) return json.readTree(Files.readString(cache));
        // Broad Bara search box is a discovery region, not a claimed course location.
        String query = "[out:json][timeout:20];nwr[\"leisure\"=\"golf_course\"](55.52,13.10,55.63,13.25);out geom;";
        JsonNode roots = request(query);
        List<JsonNode> boundaries = new ArrayList<>();
        for (JsonNode element : roots.path("elements")) {
            String name = element.path("tags").path("name").asText("").toLowerCase(Locale.ROOT);
            if (name.contains("national") || name.contains("pga sweden")) {
                for (JsonNode ring : outerRings(element)) {
                    ObjectNode boundary = element.deepCopy(); boundary.set("geometry", ring); boundaries.add(boundary);
                }
            }
        }
        if (boundaries.isEmpty()) throw new IOException("Ingen verifierbar National-gräns hittades i OpenStreetMap.");
        double minLat = 90, minLon = 180, maxLat = -90, maxLon = -180;
        for (JsonNode root : boundaries) for (JsonNode p : root.path("geometry")) {
            minLat = Math.min(minLat, p.path("lat").asDouble()); maxLat = Math.max(maxLat, p.path("lat").asDouble());
            minLon = Math.min(minLon, p.path("lon").asDouble()); maxLon = Math.max(maxLon, p.path("lon").asDouble());
        }
        String bbox = String.format(Locale.ROOT, "%.6f,%.6f,%.6f,%.6f", minLat, minLon, maxLat, maxLon);
        JsonNode details = request("[out:json][timeout:20];(nwr[\"golf\"](" + bbox + ");nwr[\"natural\"=\"water\"](" + bbox + ");nwr[\"leisure\"=\"golf_course\"](" + bbox + "););out geom;");
        ObjectNode result = json.createObjectNode();
        result.put("type", "FeatureCollection"); result.put("source", "OpenStreetMap / Overpass");
        result.put("attribution", "© OpenStreetMap contributors · ODbL 1.0");
        result.put("fetchedAt", Instant.now().toString());
        result.put("notice", "Öppna kartdata, inte officiella green- eller flaggpositioner. Links/Lakes-tillhörighet visas endast där källan anger den.");
        result.putArray("center").add((minLat + maxLat) / 2).add((minLon + maxLon) / 2);
        ArrayNode features = result.putArray("features");
        List<JsonNode> expanded = new ArrayList<>();
        for (JsonNode element : details.path("elements")) {
            if (element.has("geometry")) expanded.add(element);
            else for (JsonNode ring : outerRings(element)) {
                ObjectNode copy = element.deepCopy(); copy.set("geometry", ring); expanded.add(copy);
            }
        }
        for (JsonNode element : expanded) {
            JsonNode geometry = element.path("geometry");
            if (!geometry.isArray() || geometry.size() < 2) continue;
            JsonNode first = geometry.get(0);
            boolean belongs = boundaries.stream().anyMatch(b -> contains(b.path("geometry"), first.path("lat").asDouble(), first.path("lon").asDouble()));
            boolean courseBoundary = element.path("tags").path("leisure").asText().equals("golf_course");
            boolean isNationalBoundary = boundaries.stream().anyMatch(b -> b.path("id").equals(element.path("id")) && b.path("type").equals(element.path("type")));
            if (!belongs && !isNationalBoundary) continue;
            ObjectNode feature = features.addObject(); feature.put("type", "Feature");
            feature.put("id", element.path("type").asText() + "/" + element.path("id").asText());
            ObjectNode properties = feature.putObject("properties");
            properties.set("tags", element.path("tags"));
            String label = element.path("tags").path("name").asText("") + " " + element.path("tags").path("course").asText("");
            String lower = label.toLowerCase(Locale.ROOT);
            String course = lower.contains("links") ? "links" : lower.contains("lakes") ? "lakes" : "unassigned";
            if (course.equals("unassigned")) {
                List<String> containingCourses = new ArrayList<>();
                for (JsonNode area : expanded) {
                    String areaName = area.path("tags").path("name").asText("").toLowerCase(Locale.ROOT);
                    if (!area.path("tags").path("leisure").asText().equals("golf_course")) continue;
                    if (!contains(area.path("geometry"), first.path("lat").asDouble(), first.path("lon").asDouble())) continue;
                    String identity = areaName.contains("links") ? "links" : areaName.contains("lakes") ? "lakes" : "unassigned";
                    if (!identity.equals("unassigned") && !containingCourses.contains(identity)) containingCourses.add(identity);
                }
                if (containingCourses.size() == 1) course = containingCourses.getFirst();
            }
            properties.put("course", course);
            JsonNode last = geometry.get(geometry.size() - 1);
            boolean closed = first.path("lat").asDouble() == last.path("lat").asDouble() && first.path("lon").asDouble() == last.path("lon").asDouble();
            boolean hole = element.path("tags").path("golf").asText().equals("hole");
            ObjectNode geo = feature.putObject("geometry");
            geo.put("type", closed && !hole ? "Polygon" : "LineString");
            ArrayNode coordinates = geo.putArray("coordinates");
            ArrayNode line = closed && !hole ? coordinates.addArray() : coordinates;
            for (JsonNode p : geometry) line.addArray().add(p.path("lon").asDouble()).add(p.path("lat").asDouble());
        }
        Files.createDirectories(cache.getParent());
        Files.writeString(cache, json.writeValueAsString(result));
        return result;
    }
    private JsonNode request(String query) throws IOException, InterruptedException {
        HttpRequest req = HttpRequest.newBuilder(URI.create("https://overpass-api.de/api/interpreter")).timeout(Duration.ofSeconds(28))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString("data=" + URLEncoder.encode(query, StandardCharsets.UTF_8))).build();
        HttpResponse<String> response = client.send(req, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IOException("Kartleverantören svarade med HTTP " + response.statusCode());
        return json.readTree(response.body());
    }
    static boolean contains(JsonNode polygon, double lat, double lon) {
        boolean inside = false;
        for (int i = 0, j = polygon.size() - 1; i < polygon.size(); j = i++) {
            JsonNode a = polygon.get(i), b = polygon.get(j);
            double ay = a.path("lat").asDouble(), by = b.path("lat").asDouble();
            if ((ay > lat) != (by > lat) && lon < (b.path("lon").asDouble() - a.path("lon").asDouble()) * (lat - ay) / (by - ay) + a.path("lon").asDouble()) inside = !inside;
        }
        return inside;
    }
    static List<JsonNode> outerRings(JsonNode element) {
        if (element.has("geometry")) return List.of(element.path("geometry"));
        List<List<JsonNode>> segments = new ArrayList<>();
        for (JsonNode member : element.path("members")) {
            String role = member.path("role").asText();
            if ((!role.isEmpty() && !role.equals("outer")) || !member.path("geometry").isArray()) continue;
            List<JsonNode> points = new ArrayList<>(); member.path("geometry").forEach(points::add);
            if (points.size() > 1) segments.add(points);
        }
        List<JsonNode> rings = new ArrayList<>();
        while (!segments.isEmpty()) {
            List<JsonNode> ring = new ArrayList<>(segments.removeFirst());
            boolean changed = true;
            while (!same(ring.getFirst(), ring.getLast()) && changed) {
                changed = false;
                for (int i = 0; i < segments.size(); i++) {
                    List<JsonNode> s = segments.get(i);
                    if (same(ring.getLast(), s.getLast())) s = new ArrayList<>(s.reversed());
                    if (same(ring.getLast(), s.getFirst())) {
                        ring.addAll(s.subList(1, s.size())); segments.remove(i); changed = true; break;
                    }
                }
            }
            if (ring.size() >= 4 && same(ring.getFirst(), ring.getLast())) {
                ArrayNode array = new ObjectMapper().createArrayNode(); ring.forEach(array::add); rings.add(array);
            }
        }
        return rings;
    }
    private static boolean same(JsonNode a, JsonNode b) {
        return a.path("lat").asDouble() == b.path("lat").asDouble() && a.path("lon").asDouble() == b.path("lon").asDouble();
    }
}
