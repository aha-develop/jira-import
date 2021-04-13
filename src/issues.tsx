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
const MAX_RESULTS = 25;

importer.on({ action: "listFilters" }, async () => {
  await jira.authenticate();

  const filters = {
    project: {
      title: "Project",
      required: true,
      type: "text",
    },
    issuetype: {
      title: "Issue type",
      required: false,
      type: "select",
    },
    jql: {
      title: "JQL",
      required: false,
      type: "text",
    },
  };

  if (jira.resources.length > 1) {
    filters["resource"] = {
      title: "Account",
      required: true,
      type: "select",
    };
  }

  return filters;
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
            `/rest/api/3/project/${filters.project}?expand=issueTypes`,
            resource
          );
          types = response.issueTypes;
        } catch (err) {
          console.log("fallback to all issuetypes");
        }
      }

      if (!types) {
        types = await jira.fetch("/rest/api/3/issuetype", resource);
      }

      return [
        ...(types || []).reduce((acc: Set<any>, it) => {
          acc.add(it.name);
          return acc;
        }, new Set()),
      ].map((it) => ({ text: it, value: it }));
    }
    case "project":
      const response = await jira.fetch(
        `/rest/api/3/project/search?query=${filters.project}`,
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
    `project=${filters.project}`,
    filters.issuetype ? `(issuetype="${filters.issuetype}")` : null,
    filters.jql ? `(${filters.jql})` : null,
  ]
    .filter(Boolean)
    .join(" AND ");

  const response = await jira.fetch(
    `/rest/api/3/search?jql=${encodeURIComponent(
      jql
    )}&maxResults=${MAX_RESULTS}&startAt=${
      nextPage || 0
    }&fields=id,key,issuetype,summary,description,comment,attachment&expand=renderedFields`,
    filters.resource || jira.resources[0].id
  );

  const issues = response.issues as any[];
  console.log(issues);

  return {
    records: issues.map((issue) => ({
      uniqueId: issue.id,
      name: issue.fields.summary,
      identifier: issue.key,
      url: issue.self,
      key: issue.key,
      description: issue.renderedFields?.description || "",
      issuetype: issue.fields.issuetype,
    })),
    nextPage: (nextPage || 0) + MAX_RESULTS,
  };
});

importer.on({ action: "importRecord" }, async ({ importRecord, ahaRecord }) => {
  if (importRecord.description.length > 0) {
    (ahaRecord as any).description = importRecord.description;
  }

  await ahaRecord.save();
});

importer.on({ action: "renderRecord" }, ({ record, onUnmounted }) => {
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
            <a href={record.url} target="_blank" rel="noopener noreferrer">
              <i className="text-muted fa-solid fa-external-link"></i>
            </a>
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
