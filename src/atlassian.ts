const API_ENDPOINT = "https://api.atlassian.com";

interface AtlassianResource {
  id: string;
  avatarUrl: string;
  name: string;
  scopes: string[];
  url: string;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class Atlassian {
  private _token: string;
  private _authing: boolean = false;
  private _accessibleResources: AtlassianResource[];

  constructor(private service: string) {}

  get token() {
    return this._token;
  }

  get authing() {
    return this._authing;
  }

  get authenticated() {
    return Boolean(this._token);
  }

  get headers() {
    return {
      Authorization: "Bearer " + this.token,
      Accept: "application/json",
    };
  }

  get resources() {
    return this._accessibleResources;
  }

  async authenticate(useCache = true) {
    if (useCache && this._token) return;

    this._authing = true;
    const authData = await aha.auth("atlassian", {
      useCachedRetry: useCache,
      parameters: { scope: "offline_access read:jira-work" },
    });
    this._token = authData.token;

    try {
      await this.loadResources();
    } catch (err) {
      if (useCache && err instanceof AuthError) {
        await this.authenticate(false);
      } else {
        throw err;
      }
    }

    this._authing = false;
  }

  async loadResources() {
    const response = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      { headers: this.headers }
    );

    if (!response.ok && response.status === 401) {
      throw new AuthError(response.statusText);
    }

    const json = (await response.json()) as AtlassianResource[];

    if (json.length === 0) {
      throw new Error("No accessible resources");
    }

    this._accessibleResources = json;
  }

  async fetch(path: string, resourceId: string, options: RequestInit = {}) {
    const url = `${API_ENDPOINT}/ex/${this.service}/${resourceId}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: this.headers,
    });
    const json = await response.json();
    return json;
  }
}
