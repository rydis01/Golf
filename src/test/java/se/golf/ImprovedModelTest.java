package se.golf;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ImprovedModelTest {
    private final ShotCalculator.Weather calm = new ShotCalculator.Weather(20,50,1013.25,0,0,0);
    private ShotCalculator.Shot shot(double distance,double height,String lie,Double time,Double descent,ShotCalculator.Weather weather,ShotCalculator.Uncertainty uncertainty) {
        return new ShotCalculator.Shot(null,null,distance,0.0,height,lie,"normal",false,weather,time,descent,uncertainty);
    }
    @Test void carryLossIsInvertedRatherThanAddedToTargetDistance() {
        assertEquals(200,ShotCalculator.calculate(shot(160,0,"sand",null,null,calm,null)).playsLike());
        assertEquals(173.9,ShotCalculator.calculate(shot(160,0,"rough",null,null,calm,null)).playsLike());
        assertEquals(149.5,ShotCalculator.calculate(shot(160,0,"flyer",null,null,calm,null)).playsLike());
    }
    @Test void headwindAndTailwindInvertTheirFractionalCarryChange() {
        var head = new ShotCalculator.Weather(20,50,1013.25,5,0,5);
        var tail = new ShotCalculator.Weather(20,50,1013.25,5,180,5);
        assertEquals(160*Math.exp(.06),ShotCalculator.calculate(shot(160,0,"fairway",null,null,head,null)).playsLike(),.05);
        assertEquals(160*Math.exp(-.04),ShotCalculator.calculate(shot(160,0,"fairway",null,null,tail,null)).playsLike(),.05);
    }
    @Test void heightSolutionHitsTheDescendingBranchOfTheEffectiveArc() {
        for(double height:new double[]{-20,0,20}) for(double angle:new double[]{30,45,60}) {
            double reference=ShotCalculator.levelCarry(160,height,angle);
            double landedHeight=Math.tan(Math.toRadians(angle))*(160-160*160/reference);
            assertEquals(height,landedHeight,1e-10);
            assertTrue(Math.tan(Math.toRadians(angle))*(1-320/reference)<0);
        }
        assertEquals(182.9,ShotCalculator.calculate(shot(160,20,"fairway",null,45.0,calm,null)).playsLike());
        assertTrue(ShotCalculator.calculate(shot(160,20,"fairway",null,30.0,calm,null)).playsLike()
                >ShotCalculator.calculate(shot(160,20,"fairway",null,60.0,calm,null)).playsLike());
    }
    @Test void measuredFlightTimeChangesForwardWindCorrectionAsWellAsDrift() {
        var wind = new ShotCalculator.Weather(20,50,1013.25,5,45,5);
        var shortFlight=ShotCalculator.calculate(shot(160,0,"fairway",3.0,null,wind,null));
        var longFlight=ShotCalculator.calculate(shot(160,0,"fairway",8.0,null,wind,null));
        assertTrue(longFlight.playsLike()>shortFlight.playsLike());
        assertTrue(Math.abs(longFlight.lateralDrift())>Math.abs(shortFlight.lateralDrift()));
    }
    @Test void estimatedTimeAndArcAgreeUnderReferenceConditions() {
        for(double angle:new double[]{35,45,55}) {
            var result=ShotCalculator.calculate(shot(160,0,"fairway",null,angle,calm,null));
            double predictedTime=Math.sqrt(2*160*Math.tan(Math.toRadians(angle))/9.80665);
            assertEquals(predictedTime,result.flightTime(),.05);
            assertEquals(160,result.playsLike());
        }
    }
    @Test void measurementAndDirectionMarginsDoNotChangeTheMeanAdvice() {
        var wind = new ShotCalculator.Weather(20,50,1013.25,5,90,8);
        var precise=ShotCalculator.calculate(shot(160,0,"fairway",null,null,wind,new ShotCalculator.Uncertainty(1.0,0.0,0.0)));
        var uncertain=ShotCalculator.calculate(shot(160,0,"fairway",null,null,wind,new ShotCalculator.Uncertainty(10.0,3.0,30.0)));
        assertEquals(precise.playsLike(),uncertain.playsLike());
        assertEquals(precise.aimBearing(),uncertain.aimBearing());
        assertTrue(uncertain.rangeHigh()>precise.rangeHigh());
        assertTrue(uncertain.rangeLow()<precise.rangeLow());
        assertTrue(uncertain.lateralMargin()>precise.lateralMargin());
    }
    @Test void unsafeOrNonfiniteInputsDoNotProducePlausibleLookingNumbers() {
        assertThrows(IllegalArgumentException.class,()->ShotCalculator.calculate(shot(50,30,"fairway",null,null,calm,null)));
        assertThrows(IllegalArgumentException.class,()->ShotCalculator.calculate(shot(160,0,"fairway",null,Double.NaN,calm,null)));
        assertThrows(IllegalArgumentException.class,()->new ShotCalculator.Uncertainty(-1.0,0.0,0.0));
        assertThrows(IllegalArgumentException.class,()->ShotCalculator.calculate(shot(160,0,"fairway",null,null,new ShotCalculator.Weather(20,50,1013.25,16,0,16),null)));
        var limited=ShotCalculator.calculate(shot(160,0,"fairway",null,null,new ShotCalculator.Weather(20,50,1013.25,5,0,25),null));
        assertTrue(limited.uncertaintyLimited());
    }
    @Test void meterAdjustmentsStillExplainTheDisplayedAdvice() {
        var result=ShotCalculator.calculate(shot(160,15,"rough",6.0,40.0,new ShotCalculator.Weather(8,80,995,6,55,9),null));
        assertEquals(result.playsLike()-result.distance(),result.adjustments().stream().mapToDouble(ShotCalculator.Adjustment::meters).sum(),.3);
        assertTrue(Double.isFinite(result.carryMargin()));
        assertTrue(result.rangeLow()<result.playsLike()&&result.rangeHigh()>result.playsLike());
    }
    @Test void practicalShotGridRemainsFiniteOrderedAndRotationInvariant() {
        for(double distance:new double[]{50,100,160,250,330})
            for(double height:new double[]{-10,0,10})
                for(double wind:new double[]{0,3,8,12})
                    for(double direction:new double[]{0,45,90,180,270}) {
                        var weather=new ShotCalculator.Weather(12,75,1000,wind,direction,wind+2);
                        var original=ShotCalculator.calculate(shot(distance,height,"fairway",null,null,weather,null));
                        var rotated=ShotCalculator.calculate(new ShotCalculator.Shot(null,null,distance,70.0,height,"fairway","normal",false,
                                new ShotCalculator.Weather(12,75,1000,wind,(direction+70)%360,wind+2)));
                        assertTrue(Double.isFinite(original.playsLike())&&Double.isFinite(original.aimOffset()));
                        assertTrue(original.rangeLow()<=original.playsLike()&&original.rangeHigh()>=original.playsLike());
                        assertEquals(original.playsLike(),rotated.playsLike(),.001);
                        assertEquals(original.aimOffset(),rotated.aimOffset(),.001);
                        assertTrue(original.carryMargin()>0&&original.lateralMargin()>0);
                    }
    }
}
