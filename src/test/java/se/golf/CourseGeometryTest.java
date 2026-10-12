package se.golf;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CourseGeometryTest {
    private final ObjectMapper json = new ObjectMapper();
    @Test void relationWaysJoinEvenWhenAFragmentIsReversed() throws Exception {
        var relation = json.readTree("""
            {"members":[
              {"role":"outer","geometry":[{"lat":0,"lon":0},{"lat":0,"lon":2},{"lat":2,"lon":2}]},
              {"role":"outer","geometry":[{"lat":0,"lon":0},{"lat":2,"lon":0},{"lat":2,"lon":2}]}
            ]}
            """);
        var rings = CourseService.outerRings(relation);
        assertEquals(1, rings.size()); assertEquals(5, rings.getFirst().size());
        assertTrue(CourseService.contains(rings.getFirst(), 1, 1));
        assertFalse(CourseService.contains(rings.getFirst(), 3, 1));
    }
    @Test void incompleteRelationIsNotTurnedIntoAnInventedBoundary() throws Exception {
        var relation = json.readTree("""
            {"members":[{"role":"outer","geometry":[{"lat":0,"lon":0},{"lat":0,"lon":2},{"lat":2,"lon":2}]}]}
            """);
        assertTrue(CourseService.outerRings(relation).isEmpty());
    }
}
