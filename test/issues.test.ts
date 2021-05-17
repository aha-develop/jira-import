const actions = new Map<string, Function>();
const importer = {
  on: ({ action }: { action: string }, callback: Function) => {
    actions.set(action, callback);
  },
};
(global as any).aha = {
  getImporter: () => importer,
};

jest.mock("react", () => {
  return {};
});

import "../src/issues";

describe("importRecord", () => {
  const importAction = actions.get("importRecord") as Function;

  it("exists", () => {
    expect(typeof importAction).toEqual("function");
  });

  it("adds the url to the description and saves", async () => {
    const ahaRecord = {
      description: "",
      save: jest.fn().mockResolvedValue(true),
    };

    const importRecord = {
      description: "<p>hello there</p>",
      url: "https://example.com/issues/123",
    };

    await importAction({ ahaRecord, importRecord });

    expect(ahaRecord.description).toEqual(
      "<p>hello there</p><p><a href='https://example.com/issues/123'>View on Jira</a></p>"
    );
    expect(ahaRecord.save).toHaveBeenCalledTimes(1);
  });
});
