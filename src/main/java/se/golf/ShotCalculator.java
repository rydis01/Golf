package se.golf;

import java.util.ArrayList;
import java.util.List;

/** Explainable empirical starting model; distances mean carry, never roll. */
public final class ShotCalculator {
    public record Point(double lat, double lon) {
        public Point {
            finite(lat, "latitud"); finite(lon, "longitud");
            if (Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new IllegalArgumentException("Ogiltiga koordinater.");
        }
    }
    public record Weather(double temperature, double humidity, double pressure,
                          double windSpeed, double windFrom, double gusts) {
        public Weather {
            range(temperature, -60, 60, "temperatur"); range(humidity, 0, 100, "luftfuktighet");
            range(pressure, 500, 1100, "lufttryck"); range(windSpeed, 0, 60, "vindstyrka");
            range(windFrom, 0, 360, "vindriktning"); range(gusts, 0, 80, "vindbyar");
            if (gusts < windSpeed) throw new IllegalArgumentException("Vindbyar måste vara minst medelvinden.");
        }
    }
    public record Shot(Point ball, Point target, Double distance, Double bearing,
                       double elevationChange, String lie, String trajectory, boolean wetBall,
                       Weather weather) {}
    public record Adjustment(String label, double meters, String explanation) {}
    public record Result(double distance, double bearing, double playsLike, double rangeLow,
                         double rangeHigh, double headwind, double crosswind, double airDensity,
                         List<Adjustment> adjustments, List<String> warnings) {}

    public static Result calculate(Shot shot) {
        if (shot == null || shot.weather == null) throw new IllegalArgumentException("Väder krävs.");
        double distance;
        double bearing;
        if (shot.distance != null) {
            range(shot.distance, 10, 350, "carryavstånd");
            if (shot.bearing == null) throw new IllegalArgumentException("Slagriktning krävs för manuellt avstånd.");
            range(shot.bearing, 0, 360, "slagriktning");
            distance = shot.distance; bearing = shot.bearing % 360;
        } else {
            if (shot.ball == null || shot.target == null) throw new IllegalArgumentException("Välj boll och mål på kartan.");
            distance = distance(shot.ball, shot.target); bearing = bearing(shot.ball, shot.target);
            range(distance, 10, 350, "carryavstånd");
        }
        range(shot.elevationChange, -100, 100, "höjdskillnad");
        double flight = switch (shot.trajectory == null ? "normal" : shot.trajectory) {
            case "low" -> 0.75; case "normal" -> 1; case "high" -> 1.25;
            default -> throw new IllegalArgumentException("Ogiltig bollbana.");
        };
        String lie = shot.lie == null ? "fairway" : shot.lie;
        double lieFactor = switch (lie) {
            case "fairway", "tee" -> 0; case "rough" -> 0.08; case "flyer" -> -0.07; case "sand" -> 0.20;
            default -> throw new IllegalArgumentException("Ogiltigt bolläge.");
        };
        Weather w = shot.weather;
        double angle = Math.toRadians(w.windFrom - bearing);
        double head = w.windSpeed * Math.cos(angle);
        double cross = w.windSpeed * Math.sin(angle);
        double windMeters = distance * head * (head >= 0 ? 0.012 : 0.008) * flight;
        double heightMeters = shot.elevationChange * switch (shot.trajectory == null ? "normal" : shot.trajectory) {
            case "low" -> 1.2; case "high" -> 0.75; default -> 1.0;
        };
        double density = density(w.temperature, w.humidity, w.pressure);
        double airMeters = distance * 0.25 * (density / density(20, 50, 1013.25) - 1);
        List<Adjustment> changes = new ArrayList<>();
        changes.add(new Adjustment("Vind", round(windMeters), head >= 0 ? "Motvind ökar spelavståndet; hög bollbana påverkas mer." : "Medvind minskar spelavståndet, vanligtvis mindre än motsvarande motvind ökar det."));
        changes.add(new Adjustment("Höjd", round(heightMeters), "Målet över bollen ökar spelavståndet. Förenklad modell för höjd och bollbana."));
        changes.add(new Adjustment("Luft", round(airMeters), "Luftdensitet från temperatur, fuktighet och lokalt lufttryck; referens 20 °C, 50 % och 1013 hPa. Fuktig luft är något lättare, inte tyngre."));
        changes.add(new Adjustment("Bolläge", round(distance * lieFactor), "Ruff och sand kan minska carry. Ett flyerläge kan ge extra längd och mindre spinn."));
        // No invented deterministic wet-ball correction: contact and spin depend on club and lie.
        List<String> warnings = new ArrayList<>();
        warnings.add("Startmodell, inte uppmätt bollflykt. Kalibrera med dina egna carryavstånd; rull ingår inte.");
        if (!lie.equals("fairway") && !lie.equals("tee")) warnings.add("Bolläget ger stor osäkerhet. Kontrollera gräset bakom bollen och risken för sämre kontakt eller flyer.");
        if (shot.wetBall) warnings.add("Våt boll eller vått gräs kan ändra kontakt och spinn. Ingen fast meterjustering används; osäkerhetsintervallet ökas.");
        if (Math.abs(cross) > 2) warnings.add("Sidvind visas separat. Siktkompensation kräver kunskap om bollbana och spinn; den beräknas inte här.");
        if (w.windSpeed >= 8) warnings.add("Stark vind: den förenklade modellen blir mindre tillförlitlig.");
        if (Math.abs(shot.elevationChange) > 20) warnings.add("Stor höjdskillnad: kontrollera att carry till målet fortfarande är ett rimligt slag.");
        double raw = distance + windMeters + heightMeters + airMeters + distance * lieFactor;
        double plays = Math.max(1, raw);
        if (raw < 1) warnings.add("Extrem kombination av höjd och vind; modellen nådde sin nedre gräns. Använd inte rådet för klubbval.");
        double uncertainty = distance * 0.035 + Math.max(0, w.gusts - w.windSpeed) * distance * 0.012 * flight
                + distance * Math.abs(lieFactor) * 0.75 + (shot.wetBall ? distance * 0.04 : 0);
        return new Result(round(distance), round(bearing), round(plays), round(Math.max(1, plays - uncertainty)),
                round(plays + uncertainty), round(head), round(cross), Math.round(density * 1000) / 1000.0,
                List.copyOf(changes), List.copyOf(warnings));
    }
    public static double distance(Point a, Point b) {
        double dlat = Math.toRadians(b.lat - a.lat), dlon = Math.toRadians(b.lon - a.lon);
        double h = Math.pow(Math.sin(dlat / 2), 2) + Math.cos(Math.toRadians(a.lat)) * Math.cos(Math.toRadians(b.lat)) * Math.pow(Math.sin(dlon / 2), 2);
        return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
    }
    public static double bearing(Point a, Point b) {
        double delta = Math.toRadians(b.lon - a.lon), latA = Math.toRadians(a.lat), latB = Math.toRadians(b.lat);
        return (Math.toDegrees(Math.atan2(Math.sin(delta) * Math.cos(latB), Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(delta))) + 360) % 360;
    }
    static double density(double celsius, double humidity, double hpa) {
        double vapor = humidity / 100 * 610.94 * Math.exp(17.625 * celsius / (celsius + 243.04));
        return (hpa * 100 - vapor) / (287.05 * (celsius + 273.15)) + vapor / (461.495 * (celsius + 273.15));
    }
    private static double round(double n) { return Math.round(n * 10) / 10.0; }
    private static void finite(double n, String label) { if (!Double.isFinite(n)) throw new IllegalArgumentException("Ogiltig " + label + "."); }
    private static void range(double n, double min, double max, String label) {
        finite(n, label); if (n < min || n > max) throw new IllegalArgumentException(label + " måste ligga mellan " + min + " och " + max + ".");
    }
}
