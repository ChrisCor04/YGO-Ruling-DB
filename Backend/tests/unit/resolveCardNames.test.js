// Unit tests for the resolveCardNames helper.
// The DB pool is mocked so these run instantly with no network dependency.

jest.mock("../../api/db", () => ({ query: jest.fn() }));

const pool = require("../../api/db");
const resolveCardNames = require("../../api/utils/resolveCardNames");

// Reset mock call history between tests
beforeEach(() => pool.query.mockReset());

describe("resolveCardNames", () => {
  test("returns text unchanged when there are no placeholders", async () => {
    const input = ["This ruling has no card references."];
    const result = await resolveCardNames(input);

    expect(result).toEqual(input);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test("replaces a single <<id>> with the matching card name", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ card_id: 5234, name: "Embodiment of Apophis" }],
    });

    const result = await resolveCardNames(["Can <<5234>> be sent to the GY?"]);

    expect(result[0]).toBe("Can Embodiment of Apophis be sent to the GY?");
  });

  test("replaces multiple different IDs across multiple text fields in one DB query", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { card_id: 5234, name: "Embodiment of Apophis" },
        { card_id: 6808, name: "Offerings to the Doomed" },
      ],
    });

    const result = await resolveCardNames([
      "Can <<5234>> activate <<6808>>?",
      "<<6808>> targets a monster.",
    ]);

    expect(result[0]).toBe("Can Embodiment of Apophis activate Offerings to the Doomed?");
    expect(result[1]).toBe("Offerings to the Doomed targets a monster.");
    // Crucially: only one DB round-trip regardless of how many placeholders
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test("leaves <<id>> intact when the card ID is not in the database", async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const result = await resolveCardNames(["See <<99999>>."]);

    expect(result[0]).toBe("See <<99999>>.");
  });

  test("deduplicates repeated IDs so only one DB query is made", async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ card_id: 5234, name: "Embodiment of Apophis" }],
    });

    await resolveCardNames(["<<5234>> and <<5234>> again."]);

    const calledWith = pool.query.mock.calls[0][1][0];
    // The ID should only appear once in the query parameter
    expect(calledWith.filter((id) => id === 5234)).toHaveLength(1);
  });

  test("handles null text fields without throwing", async () => {
    const result = await resolveCardNames([null, "Normal text", null]);

    expect(result[0]).toBeNull();
    expect(result[1]).toBe("Normal text");
    expect(result[2]).toBeNull();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
