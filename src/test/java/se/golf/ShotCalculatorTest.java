package se.golf;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ShotCalculatorTest {
    private ShotCalculator.Shot shot(double bearing, double wind, double from, double height, String lie, boolean wet) {
        return new ShotCalculator.Shot(null, null, 160.0, bearing, height, lie, "normal", wet,
                new ShotCalculator.Weather(20, 50, 1013.25, wind, from, wind));
    }
    @Test void referenceWeatherHasNoAdjustment() {
        var result = ShotCalculator.calculate(shot(0, 0, 0, 0, "fairway", false));
        assertEquals(160, result.playsLike()); assertEquals(0, result.headwind());
    }
    @Test void meteorologicalWindDirectionHasCorrectSign() {
        var head = ShotCalculator.calculate(shot(0, 5, 0, 0, "fairway", false));
        var tail = ShotCalculator.calculate(shot(0, 5, 180, 0, "fairway", false));
        assertTrue(head.playsLike() > 160); assertTrue(tail.playsLike() < 160);
        assertTrue(head.playsLike() - 160 > 160 - tail.playsLike());
        assertEquals(5, head.headwind()); assertEquals(-5, tail.headwind());
    }
    @Test void reversingShotReversesWind() {
        assertTrue(ShotCalculator.calculate(shot(180, 5, 0, 0, "fairway", false)).playsLike() < 160);
        assertTrue(ShotCalculator.calculate(shot(90, 5, 90, 0, "fairway", false)).playsLike() > 160);
    }
    @Test void pureCrosswindDoesNotInventCarryOrAimCorrection() {
        var result = ShotCalculator.calculate(shot(0, 5, 90, 0, "fairway", false));
        assertEquals(160, result.playsLike()); assertEquals(5, result.crosswind());
        assertTrue(result.warnings().stream().anyMatch(s -> s.contains("Sidvind")));
    }
    @Test void elevationAndLieAffectCarryInExpectedDirection() {
        assertTrue(ShotCalculator.calculate(shot(0, 0, 0, 10, "fairway", false)).playsLike() > 160);
        assertTrue(ShotCalculator.calculate(shot(0, 0, 0, -10, "fairway", false)).playsLike() < 160);
        assertTrue(ShotCalculator.calculate(shot(0, 0, 0, 0, "rough", false)).playsLike() > 160);
        assertTrue(ShotCalculator.calculate(shot(0, 0, 0, 0, "flyer", false)).playsLike() < 160);
    }
    @Test void coldAirIsDenserAndHumidityReducesDensity() {
        assertTrue(ShotCalculator.density(5, 50, 1013.25) > ShotCalculator.density(20, 50, 1013.25));
        assertTrue(ShotCalculator.density(20, 90, 1013.25) < ShotCalculator.density(20, 10, 1013.25));
        var cold = new ShotCalculator.Shot(null, null, 160.0, 0.0, 0, "fairway", "normal", false, new ShotCalculator.Weather(5, 50, 1013.25, 0, 0, 0));
        assertTrue(ShotCalculator.calculate(cold).playsLike() > 160);
    }
    @Test void gustsAndWetContactIncreaseUncertainty() {
        var dry = ShotCalculator.calculate(shot(0, 5, 0, 0, "fairway", false));
        var wet = ShotCalculator.calculate(shot(0, 5, 0, 0, "fairway", true));
        assertEquals(dry.playsLike(), wet.playsLike()); assertTrue(wet.rangeHigh() > dry.rangeHigh());
        var gust = ShotCalculator.calculate(new ShotCalculator.Shot(null, null, 160.0, 0.0, 0, "fairway", "normal", false, new ShotCalculator.Weather(20, 50, 1013.25, 5, 0, 12)));
        assertTrue(gust.rangeHigh() > dry.rangeHigh());
    }
    @Test void coordinateDistanceAndBearingAreGeodesic() {
        var a = new ShotCalculator.Point(55.57, 13.18);
        var b = new ShotCalculator.Point(55.571, 13.18);
        assertEquals(111.195, ShotCalculator.distance(a, b), .1); assertEquals(0, ShotCalculator.bearing(a, b), .01);
        var shot = new ShotCalculator.Shot(a, b, null, null, 0, "fairway", "normal", false, new ShotCalculator.Weather(20, 50, 1013.25, 0, 0, 0));
        assertEquals(111.2, ShotCalculator.calculate(shot).playsLike());
    }
    @Test void invalidValuesFailInsteadOfProducingAdvice() {
        assertThrows(IllegalArgumentException.class, () -> new ShotCalculator.Point(Double.NaN, 0));
        assertThrows(IllegalArgumentException.class, () -> new ShotCalculator.Weather(20, 50, 1013, -1, 0, 0));
        assertThrows(IllegalArgumentException.class, () -> new ShotCalculator.Weather(20, 50, 1013, 5, 0, 2));
        assertThrows(IllegalArgumentException.class, () -> ShotCalculator.calculate(shot(0, 0, 0, 0, "unknown", false)));
        assertThrows(IllegalArgumentException.class, () -> ShotCalculator.calculate(new ShotCalculator.Shot(null, null, 0.0, 0.0, 0, "fairway", "normal", false, new ShotCalculator.Weather(20, 50, 1013, 0, 0, 0))));
    }
    @Test void higherTrajectoryIsMoreWindSensitive() {
        var low = new ShotCalculator.Shot(null, null, 160.0, 0.0, 0, "fairway", "low", false, new ShotCalculator.Weather(20, 50, 1013.25, 5, 0, 5));
        var high = new ShotCalculator.Shot(null, null, 160.0, 0.0, 0, "fairway", "high", false, low.weather());
        assertTrue(ShotCalculator.calculate(high).playsLike() > ShotCalculator.calculate(low).playsLike());
    }
}
