package se.golf;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;

public final class WeatherService {
    private final HttpClient client = NetworkClients.create();
    private final ObjectMapper json;
    public WeatherService(ObjectMapper json) { this.json = json; }
    public JsonNode forecast(double lat, double lon) throws IOException, InterruptedException {
        new ShotCalculator.Point(lat, lon);
        return fetch(String.format(Locale.ROOT,
                "https://api.open-meteo.com/v1/forecast?latitude=%.6f&longitude=%.6f&current=temperature_2m,relative_humidity_2m,surface_pressure,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability&wind_speed_unit=ms&forecast_days=2&timezone=auto", lat, lon));
    }
    public JsonNode elevation(double lat, double lon, double targetLat, double targetLon) throws IOException, InterruptedException {
        new ShotCalculator.Point(lat, lon); new ShotCalculator.Point(targetLat, targetLon);
        return fetch(String.format(Locale.ROOT, "https://api.open-meteo.com/v1/elevation?latitude=%.6f,%.6f&longitude=%.6f,%.6f", lat, targetLat, lon, targetLon));
    }
    private JsonNode fetch(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(12)).header("Accept", "application/json").GET().build();
        HttpResponse<String> result = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (result.statusCode() != 200) throw new IOException("Väderleverantören svarade med HTTP " + result.statusCode() + ".");
        JsonNode data = json.readTree(result.body());
        if (data == null || data.has("error")) throw new IOException("Väderleverantören skickade ett ogiltigt svar.");
        return data;
    }
}
