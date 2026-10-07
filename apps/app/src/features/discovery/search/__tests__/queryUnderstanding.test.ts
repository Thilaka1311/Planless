import { describe, it, expect } from "vitest";
import { understandQuery } from "../engine/queryUnderstanding";

describe("Search Domain - Query Understanding Engine", () => {
  it("classifies specific place names as SEARCH_PLACE", () => {
    const truffles = understandQuery("Truffles");
    expect(truffles.intent).toBe("SEARCH_PLACE");
    expect(truffles.cleanSearchTerm).toBe("Truffles");

    const thirdWave = understandQuery("Third Wave Coffee");
    expect(thirdWave.intent).toBe("SEARCH_PLACE");
    expect(thirdWave.cleanSearchTerm).toBe("Third Wave Coffee");

    const toit = understandQuery("Toit Indiranagar");
    expect(toit.intent).toBe("SEARCH_PLACE");
    expect(toit.cleanSearchTerm).toBe("Toit Indiranagar");

    const playArena = understandQuery("Play Arena");
    expect(playArena.intent).toBe("SEARCH_PLACE");

    const cultFit = understandQuery("Cult Fit");
    expect(cultFit.intent).toBe("SEARCH_PLACE");

    const turfInc = understandQuery("Bengaluru Turf Inc");
    expect(turfInc.intent).toBe("SEARCH_PLACE");

    const amoeba = understandQuery("Amoeba Bowling");
    expect(amoeba.intent).toBe("SEARCH_PLACE");

    const pvr = understandQuery("PVR Cinemas");
    expect(pvr.intent).toBe("SEARCH_PLACE");
  });

  it("classifies sport-specific queries as SEARCH_SPORT", () => {
    const football = understandQuery("football turf");
    expect(football.intent).toBe("SEARCH_SPORT");
    expect(football.categoryHint).toBe("SPORTS");
    expect(football.sportCategory).toBe("football");

    const badminton = understandQuery("badminton court");
    expect(badminton.intent).toBe("SEARCH_SPORT");
    expect(badminton.sportCategory).toBe("badminton");

    const cricket = understandQuery("cricket nets");
    expect(cricket.intent).toBe("SEARCH_SPORT");
    expect(cricket.sportCategory).toBe("cricket");
  });

  it("classifies dining category queries as SEARCH_DINING", () => {
    const restaurants = understandQuery("restaurants");
    expect(restaurants.intent).toBe("SEARCH_DINING");
    expect(restaurants.categoryHint).toBe("DINING");

    const cafes = understandQuery("cafes");
    expect(cafes.intent).toBe("SEARCH_DINING");
    expect(cafes.categoryHint).toBe("DINING");

    const pizza = understandQuery("pizza");
    expect(pizza.intent).toBe("SEARCH_DINING");
  });

  it("classifies activity category queries as SEARCH_ACTIVITY", () => {
    const bowling = understandQuery("bowling");
    expect(bowling.intent).toBe("SEARCH_ACTIVITY");
    expect(bowling.categoryHint).toBe("ACTIVITIES");

    const arcade = understandQuery("arcade gaming");
    expect(arcade.intent).toBe("SEARCH_ACTIVITY");
  });

  it("classifies movie queries as SEARCH_MOVIE", () => {
    const movie = understandQuery("movies in imax");
    expect(movie.intent).toBe("SEARCH_MOVIE");
    expect(movie.categoryHint).toBe("MOVIES");
  });

  it("classifies combined queries ('entity/category + location') as SEARCH_COMBINED", () => {
    const combinedSport = understandQuery("football turf near Koramangala");
    expect(combinedSport.intent).toBe("SEARCH_COMBINED");
    expect(combinedSport.cleanSearchTerm).toBe("football turf");
    expect(combinedSport.sportCategory).toBe("football");
    expect(combinedSport.locationQualifier?.normalized).toBe("koramangala");

    const combinedDining = understandQuery("restaurants in Indiranagar");
    expect(combinedDining.intent).toBe("SEARCH_COMBINED");
    expect(combinedDining.cleanSearchTerm).toBe("restaurants");
    expect(combinedDining.categoryHint).toBe("DINING");
    expect(combinedDining.locationQualifier?.normalized).toBe("indiranagar");

    const combinedHsr = understandQuery("restaurants in HSR");
    expect(combinedHsr.intent).toBe("SEARCH_COMBINED");
    expect(combinedHsr.cleanSearchTerm).toBe("restaurants");
    expect(combinedHsr.categoryHint).toBe("DINING");
    expect(combinedHsr.locationQualifier?.normalized).toBe("hsr");
  });

  it("classifies pure location names as SEARCH_LOCATION", () => {
    const loc = understandQuery("Koramangala");
    expect(loc.intent).toBe("SEARCH_LOCATION");
    expect(loc.locationQualifier?.normalized).toBe("koramangala");
  });

  it("classifies empty search as BROWSE_CATEGORY with active category hint", () => {
    const browse = understandQuery("", "SPORTS", "football");
    expect(browse.intent).toBe("BROWSE_CATEGORY");
    expect(browse.categoryHint).toBe("SPORTS");
    expect(browse.sportCategory).toBe("football");
  });
});
