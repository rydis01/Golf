package se.golf;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class SideWindTest {
    private ShotCalculator.Shot shot(double bearing,double from,double gusts,String trajectory,Double time) {
        return new ShotCalculator.Shot(null,null,160.0,bearing,0,"fairway",trajectory,false,
                new ShotCalculator.Weather(20,50,1013.25,5,from,gusts),time);
    }
    @Test void windFromRightDriftsLeftAndAimCompensatesRight() {
        var result=ShotCalculator.calculate(shot(0,90,5,"normal",null));
        assertTrue(result.lateralDrift()<0);assertTrue(result.aimOffset()>0);
        assertTrue(result.aimBearing()>0 && result.aimBearing()<10);
        assertEquals(-result.lateralDrift(),result.aimOffset(),.001);
    }
    @Test void reversingCrosswindReversesDriftAndAim() {
        var right=ShotCalculator.calculate(shot(0,90,5,"normal",null));
        var left=ShotCalculator.calculate(shot(0,270,5,"normal",null));
        assertEquals(-right.lateralDrift(),left.lateralDrift(),.001);
        assertTrue(left.aimOffset()<0);assertTrue(left.aimBearing()>350);
    }
    @Test void alignmentProducesNoLateralDriftAndRotationPreservesRelativeAdvice() {
        assertEquals(0,ShotCalculator.calculate(shot(0,0,5,"normal",null)).lateralDrift());
        var north=ShotCalculator.calculate(shot(0,90,5,"normal",null));
        var east=ShotCalculator.calculate(shot(90,180,5,"normal",null));
        assertEquals(north.lateralDrift(),east.lateralDrift());
        assertEquals(90,east.aimBearing()-north.aimBearing(),.1);
    }
    @Test void LongerFlightAndHighTrajectoryIncreaseDrift() {
        var shortFlight=ShotCalculator.calculate(shot(0,90,5,"normal",3.0));
        var longFlight=ShotCalculator.calculate(shot(0,90,5,"normal",8.0));
        assertTrue(Math.abs(longFlight.lateralDrift())>Math.abs(shortFlight.lateralDrift()));
        assertTrue(longFlight.flightTimeMeasured());
        var low=ShotCalculator.calculate(shot(0,90,5,"low",null));
        var high=ShotCalculator.calculate(shot(0,90,5,"high",null));
        assertTrue(Math.abs(high.lateralDrift())>Math.abs(low.lateralDrift()));
    }
    @Test void GustsIncreaseMarginAndInvalidFlightTimeFails() {
        var calm=ShotCalculator.calculate(shot(0,90,5,"normal",null));
        var gust=ShotCalculator.calculate(shot(0,90,10,"normal",null));
        assertTrue(gust.lateralHigh()-gust.lateralLow()>calm.lateralHigh()-calm.lateralLow());
        assertTrue(calm.lateralLow()<calm.lateralDrift() && calm.lateralHigh()>calm.lateralDrift());
        assertThrows(IllegalArgumentException.class,()->ShotCalculator.calculate(shot(0,90,5,"normal",0.0)));
        assertThrows(IllegalArgumentException.class,()->ShotCalculator.calculate(shot(0,90,5,"normal",Double.NaN)));
    }
}
