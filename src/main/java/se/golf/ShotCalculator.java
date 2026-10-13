package se.golf;

import java.util.ArrayList;
import java.util.List;

/** Inverse carry model with an effective arc; empirical factors still require field validation. */
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
    public record Uncertainty(Double distance, Double elevation, Double windDirection) {
        public Uncertainty {
            if (distance != null) range(distance, 0, 100, "avståndsmarginal");
            if (elevation != null) range(elevation, 0, 30, "höjdmarginal");
            if (windDirection != null) range(windDirection, 0, 90, "vindriktningsmarginal");
        }
    }
    public record Shot(Point ball, Point target, Double distance, Double bearing,
                       double elevationChange, String lie, String trajectory, boolean wetBall,
                       Weather weather, Double flightTime, Double descentAngle, Uncertainty uncertainty) {
        public Shot(Point ball, Point target, Double distance, Double bearing, double elevationChange,
                    String lie, String trajectory, boolean wetBall, Weather weather, Double flightTime) {
            this(ball, target, distance, bearing, elevationChange, lie, trajectory, wetBall, weather, flightTime, null, null);
        }
        public Shot(Point ball, Point target, Double distance, Double bearing, double elevationChange,
                    String lie, String trajectory, boolean wetBall, Weather weather) {
            this(ball, target, distance, bearing, elevationChange, lie, trajectory, wetBall, weather, null, null, null);
        }
    }
    public record Adjustment(String label, double meters, String explanation) {}
    public record Result(double distance, double bearing, double playsLike, double rangeLow,
                         double rangeHigh, double headwind, double crosswind, double airDensity,
                         double flightTime, boolean flightTimeMeasured, double lateralDrift,
                         double lateralLow, double lateralHigh, double aimOffset, double aimBearing,
                         double descentAngle, double carryMargin, double lateralMargin,
                         double distanceUncertainty, boolean uncertaintyLimited,
                         List<Adjustment> adjustments, List<String> warnings) {}
    private record Plan(double reference, double time, double drift, double delta) {}
    private static final double REFERENCE_DENSITY = density(20, 50, 1013.25);

    public static Result calculate(Shot shot) {
        if (shot == null || shot.weather == null) throw new IllegalArgumentException("Väder krävs.");
        double distance, bearing;
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
        if (shot.flightTime != null) range(shot.flightTime, 1, 15, "flygtid");
        if (shot.descentAngle != null) range(shot.descentAngle, 15, 75, "landningsvinkel");
        String trajectory = shot.trajectory == null ? "normal" : shot.trajectory;
        double estimatedDescent = switch (trajectory) {
            case "low" -> 35; case "normal" -> 45; case "high" -> 55;
            default -> throw new IllegalArgumentException("Ogiltig bollbana.");
        };
        double descent = shot.descentAngle != null ? shot.descentAngle : estimatedDescent;
        double flight = Math.sqrt(Math.tan(Math.toRadians(descent)));
        String lie = shot.lie == null ? "fairway" : shot.lie;
        double lieGain = switch (lie) {
            case "fairway", "tee" -> 1; case "rough" -> .92; case "flyer" -> 1.07; case "sand" -> .80;
            default -> throw new IllegalArgumentException("Ogiltigt bolläge.");
        };
        Weather w = shot.weather;
        if (w.windSpeed > 15) throw new IllegalArgumentException("Medelvind över 15 m/s ligger utanför modellen. Ge inget exakt klubbval i dessa förhållanden.");
        double density = density(w.temperature, w.humidity, w.pressure);
        double airGain = Math.pow(REFERENCE_DENSITY / density, .25);
        Plan straight = directed(distance, bearing, shot.elevationChange, descent, flight, lieGain, airGain, density, w, shot.flightTime, 0);
        Plan aimed = solve(distance, bearing, shot.elevationChange, descent, flight, lieGain, airGain, density, w, shot.flightTime);
        double level = levelCarry(distance, shot.elevationChange, descent);
        List<Adjustment> changes = new ArrayList<>();
        changes.add(new Adjustment("Vind", round(straight.reference - level / airGain / lieGain), "Vindförlusten räknas baklänges till carry i lugnt väder. Angiven flygtid påverkar både längd och sidodrift."));
        changes.add(new Adjustment("Höjd", round(level - distance), "Höjd räknas från en förenklad böjd bollbana och dess landningsvinkel, inte ett fast antal meter per höjdmeter."));
        changes.add(new Adjustment("Luft", round(level / airGain - level), "Luftdensitet från temperatur, fuktighet och lokalt lufttryck. Fuktig luft är något lättare. Kall boll och spinn är inte uppmätta."));
        changes.add(new Adjustment("Bolläge", round(level / airGain / lieGain - level / airGain), "En carryförlust måste inverteras: 20 % förlust kräver 25 % extra referenscarry. Ruff, flyer och sand är fortfarande uppskattningar."));
        changes.add(new Adjustment("Sikte", round(aimed.reference - straight.reference), "Siktet mot sidvinden ändrar också mot-/medvindskomponenten. Längd, flygtid och sikte löses tillsammans."));
        Uncertainty u = shot.uncertainty;
        double distanceError = u != null && u.distance != null ? u.distance : 3;
        double heightError = u != null && u.elevation != null ? u.elevation : 1;
        double directionError = u != null && u.windDirection != null ? u.windDirection : 15;
        double low = aimed.reference, high = aimed.reference, driftError = 0;
        boolean limited = false;
        double gustExtra = w.gusts - w.windSpeed;
        List<Double> directions = new ArrayList<>(List.of(w.windFrom - directionError, w.windFrom, w.windFrom + directionError));
        // Include extrema of the longitudinal/lateral components inside the direction envelope.
        for (double cardinal : new double[]{bearing, bearing + 90, bearing + 180, bearing + 270}) {
            double difference = Math.abs(normalize(cardinal - w.windFrom + 180) - 180);
            if (difference <= directionError) directions.add(normalize(cardinal));
        }
        for (double speed : new double[]{Math.max(0, w.windSpeed - gustExtra), w.windSpeed, w.gusts}) {
            for (double direction : directions) {
                Weather scenario = new Weather(w.temperature, w.humidity, w.pressure, speed, normalize(direction), Math.max(speed, w.gusts));
                for (double height : new double[]{shot.elevationChange - heightError, shot.elevationChange, shot.elevationChange + heightError}) {
                    try {
                        if (speed > 15) throw new IllegalArgumentException();
                        Plan p = solve(distance, bearing, height, descent, flight, lieGain, airGain, density, scenario, shot.flightTime);
                        low = Math.min(low, p.reference); high = Math.max(high, p.reference);
                        Plan direct = directed(distance, bearing, height, descent, flight, lieGain, airGain, density, scenario, shot.flightTime, 0);
                        driftError = Math.max(driftError, Math.abs(direct.drift - straight.drift));
                    } catch (IllegalArgumentException e) { limited = true; }
                }
            }
        }
        // Distinguish uncertainty of the required reference carry from a landing footprint in metres.
        double derivative = (solve(distance + .05, bearing, shot.elevationChange, descent, flight, lieGain, airGain, density, w, shot.flightTime).reference
                - solve(distance - .05, bearing, shot.elevationChange, descent, flight, lieGain, airGain, density, w, shot.flightTime).reference) / .1;
        if (!Double.isFinite(derivative) || derivative <= .05) limited = true;
        double baseSpread = aimed.reference * (.035 + Math.abs(1 - lieGain) * .75 + (shot.wetBall ? .04 : 0));
        double carryMargin = (Math.max(aimed.reference - low, high - aimed.reference) + baseSpread) / Math.max(.05, derivative);
        double sideMargin = Math.max(3, distance * .04) + Math.abs(straight.drift) * .30 + driftError
                + distance * (Math.abs(1 - lieGain) * .5 + (shot.wetBall ? .04 : 0));
        List<String> warnings = new ArrayList<>();
        warnings.add("Modellbaserat carryråd, inte uppmätt bollflykt. Vindkoefficienter, spinn och egen skruv behöver valideras på banan; rull ingår inte.");
        if (lieGain != 1) warnings.add("Bolläget ger stor osäkerhet. Gräs, kontakt och flyer kan inte avgöras från GPS.");
        if (shot.wetBall) warnings.add("Våt boll eller vått gräs kan ändra kontakt och spinn. Ingen fast meterjustering används; marginalerna ökas.");
        if (w.windSpeed >= 8) warnings.add("Stark vind: modellens antaganden om konstant vind och bollbana blir mindre tillförlitliga.");
        double angle = Math.toRadians(w.windFrom - bearing);
        if (Math.abs(w.windSpeed * Math.sin(angle)) > 2) warnings.add("Sidovind och sikte beräknas för ett rakt slag utan egen skruv. Vind längs bollbanan kan avvika.");
        if (shot.descentAngle == null) warnings.add("Landningsvinkeln är uppskattad från låg/normal/hög bollbana. En uppmätt vinkel kan anges i Options.");
        if (aimed.reference > 350) warnings.add("Spelavståndet överstiger 350 m. Överväg ett upplägg i stället för ett slag till målet.");
        if (distanceError > distance * .2) { limited = true; warnings.add("Avståndsmarginalen är stor i förhållande till slaget. Mät med kikare eller placera bollen mer exakt."); }
        if (limited) warnings.add("Alla osäkerhetsscenarier ryms inte i modellen. Intervallet är ofullständigt; kontrollera höjd, vind och mål innan klubbval.");
        double measurement = Math.abs(derivative) * distanceError;
        return new Result(round(distance), round(bearing), round(aimed.reference), round(Math.max(1, low - baseSpread - measurement)),
                round(high + baseSpread + measurement), round(w.windSpeed * Math.cos(angle)), round(w.windSpeed * Math.sin(angle)), Math.round(density * 1000) / 1000.0,
                round(aimed.time), shot.flightTime != null, round(straight.drift), round(straight.drift - sideMargin), round(straight.drift + sideMargin),
                round(distance * Math.tan(aimed.delta)), round(normalize(bearing + Math.toDegrees(aimed.delta))), round(descent),
                round(carryMargin), round(sideMargin), round(distanceError), limited, List.copyOf(changes), List.copyOf(warnings));
    }
    static double levelCarry(double distance, double height, double descent) {
        double tangent = Math.tan(Math.toRadians(descent));
        if (height >= distance * tangent / 2) throw new IllegalArgumentException("Målet ligger för högt för den valda bollbanan. Kontrollera höjd eller välj en högre bollbana.");
        return distance * distance / (distance - height / tangent);
    }
    private static double normalTime(double carry) { return Math.sqrt(2 * carry / 9.80665); }
    private static Plan directed(double distance, double bearing, double height, double descent, double flight,
                                 double lieGain, double airGain, double density, Weather weather, Double measuredTime, double delta) {
        double along = distance * Math.cos(delta), level = levelCarry(along, height, descent);
        double angle = Math.toRadians(weather.windFrom - bearing) - delta;
        double head = weather.windSpeed * Math.cos(angle), cross = weather.windSpeed * Math.sin(angle);
        double reference = level / airGain / lieGain;
        boolean converged = false;
        for (int i = 0; i < 100; i++) {
            double exposure = measuredTime == null ? flight : measuredTime / (normalTime(reference) * along / level);
            double gain = Math.exp(-head * (head >= 0 ? .012 : .008) * exposure);
            double next = level / (airGain * lieGain * gain);
            if (!Double.isFinite(next) || next < 1 || next > 2000) throw new IllegalArgumentException("Förhållandena ligger utanför modellens användbara område.");
            if (Math.abs(next - reference) < .000001) { reference = next; converged = true; break; }
            reference = (reference + next) / 2;
        }
        if (!converged) throw new IllegalArgumentException("Modellen kunde inte hitta ett stabilt spelavstånd.");
        double estimatedTime = normalTime(reference) * flight * along / level;
        if (measuredTime == null && estimatedTime > 15) throw new IllegalArgumentException("Bollbanans uppskattade flygtid överstiger modellens gräns. Välj ett annat slag eller en lägre bollbana.");
        double time = measuredTime != null ? measuredTime : Math.max(1, estimatedTime);
        double airspeed = Math.max(8, Math.hypot(along / time + head, cross));
        double tau = 2 * .04593 / (density * .25 * (Math.PI * .04267 * .04267 / 4) * airspeed);
        double drift = -cross * (time + tau * Math.expm1(-time / tau));
        return new Plan(reference, time, drift, delta);
    }
    private static Plan solve(double distance, double bearing, double height, double descent, double flight,
                              double lieGain, double airGain, double density, Weather weather, Double measuredTime) {
        double delta = 0;
        for (int i = 0; i < 100; i++) {
            Plan p = directed(distance, bearing, height, descent, flight, lieGain, airGain, density, weather, measuredTime, delta);
            if (Math.abs(p.drift) >= distance * .5) throw new IllegalArgumentException("Sidodriften är för stor för ett tillförlitligt siktråd. Välj ett annat slag eller en lägre bollbana.");
            double next = Math.asin(-p.drift / distance);
            if (Math.abs(next - delta) < .00000001) return p;
            delta = (delta + next) / 2;
        }
        throw new IllegalArgumentException("Modellen kunde inte hitta ett stabilt siktråd.");
    }
    private static double normalize(double angle) { return (angle % 360 + 360) % 360; }
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
