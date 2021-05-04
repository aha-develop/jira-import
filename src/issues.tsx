import React from "react";
import { Atlassian } from "./atlassian";

interface Issue extends Aha.ImportRecord {
  key: string;
  description: string;
  issuetype: {
    name: string;
    iconUrl: string;
  };
}

const importer = aha.getImporter<Issue>("aha-develop.jira-import.issues");
const jira = new Atlassian("jira");

// Only load 50 issues at a time
const MAX_RESULTS = 50;

const apiPaths = {
  project: (id: string) => `/rest/api/3/project/${id}?expand=issueTypes`,
  searchForProject: (name: string) =>
    `/rest/api/3/project/search?query=${encodeURIComponent(name)}`,
  allIssueTypes: () => "/rest/api/3/issuetype",
  searchForIssues: (jql: string, startAt: number, fields: string[]) => {
    const query = [
      ["jql", encodeURIComponent(jql)],
      ["maxResults", MAX_RESULTS],
      ["startAt", startAt],
      ["fields", fields.map(encodeURIComponent).join(",")],
      ["expand", "renderedFields"],
    ]
      .map((pair) => pair.join("="))
      .join("&");

    return `/rest/api/3/search?${query}`;
  },
};

importer.on({ action: "listFilters" }, async () => {
  return {
    project: {
      title: "Project",
      required: true,
      type: "autocomplete",
    },
    issuetype: {
      title: "Issue type",
      required: false,
      type: "autocomplete",
    },
    jql: {
      title: "JQL",
      required: false,
      type: "text",
    },
  };
});

importer.on({ action: "filterValues" }, async ({ filterName, filters }) => {
  await jira.authenticate();
  const resource = filters.resource || jira.resources[0].id;

  switch (filterName) {
    case "resource":
      return jira.resources.map((resource) => ({
        text: resource.name,
        value: resource.id,
      }));
    case "issuetype": {
      let types: any[] | null = null;

      if (filters.project) {
        try {
          const response = await jira.fetch(
            apiPaths.project(filters.project),
            resource
          );
          types = response.issueTypes;
        } catch (err) {
          console.log("fallback to all issuetypes");
        }
      }

      if (!types) {
        types = await jira.fetch(apiPaths.allIssueTypes(), resource);
      }

      // issue types are uniqued by name
      return [
        ...(types || []).reduce((acc: Set<any>, it) => {
          acc.add(it.name);
          return acc;
        }, new Set()),
      ].map((it) => ({ text: it, value: it }));
    }
    case "project":
      const response = await jira.fetch(
        apiPaths.searchForProject(filters.project),
        filters.resource || jira.resources[0].id
      );
      const projects = response.values;

      return projects.map((project) => ({
        text: project.name,
        value: project.key,
      }));
  }

  return [];
});

importer.on({ action: "listCandidates" }, async ({ filters, nextPage }) => {
  await jira.authenticate();

  const jql = [
    `project="${filters.project}"`,
    filters.issuetype ? `(issuetype="${filters.issuetype}")` : null,
    filters.jql ? `(${filters.jql})` : null,
  ]
    .filter(Boolean)
    .join(" AND ");

  const response = await jira.fetch(
    apiPaths.searchForIssues(jql, nextPage || 0, [
      "id",
      "key",
      "issuetype",
      "summary",
      "description",
      "comment",
      "attachment",
    ]),
    filters.resource || jira.resources[0].id
  );

  const issues = response.issues as any[];
  const nextNextPage =
    issues.length === 0 ? null : (nextPage || 0) + MAX_RESULTS;

  return {
    records: issues.map((issue) => ({
      uniqueId: issue.id,
      name: issue.fields.summary,
      identifier: issue.key,
      url: `${jira.resources[0].url}/browse/${issue.key}`,
      key: issue.key,
      description: issue.renderedFields?.description || "",
      issuetype: issue.fields.issuetype,
    })),
    nextPage: nextNextPage,
  };
});

// Set the record description on import
importer.on({ action: "importRecord" }, async ({ importRecord, ahaRecord }) => {
  if (importRecord.description.length > 0) {
    (ahaRecord as any).description = importRecord.description;
  }

  await ahaRecord.save();
});

// Custom record rendering so it can display the correct issue type icon
importer.on({ action: "renderRecord" }, ({ record }) => {
  const issuetype = record.issuetype;

  return (
    <div style={{ display: "flex", flexDirection: "row", gap: "4px" }}>
      {issuetype && (
        <img
          src={issuetype.iconUrl}
          alt={issuetype.name}
          style={{ height: "30px" }}
        />
      )}
      <div style={{ flexGrow: 1 }}>
        <div className="card__row">
          <div className="card__section">
            <div className="card__field">
              <span className="text-muted">{record.key}</span>
            </div>
          </div>
          <div className="card__section">
            <div className="card__field">
              <a href={record.url} target="_blank" rel="noopener noreferrer">
                <i className="text-muted fa-solid fa-external-link"></i>
              </a>
            </div>
          </div>
        </div>
        <div className="card__row">
          <div className="card__section">
            <div className="card__field">
              <a href={record.url} target="_blank" rel="noopener noreferrer">
                {record.name}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
