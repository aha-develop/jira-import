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

/**
 * Class for fetching from atlassian API using oAuth. The service to call is set
 * by the constructor:
 *
 * ```
 * const jira = new Atlassian("jira");
 * ```
 */
export class Atlassian {
  private _token?: string;
  private _authing: boolean = false;
  private _accessibleResources: AtlassianResource[] = [];

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

  /**
   * @param useCache force a full re-auth even if the token is already cached
   */
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

  /**
   * Load the resources. This must be done before calling fetch as the resource
   * id is required for each API call.
   */
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

  /**
   * @param path API path. This should be the path part only as per the standard API
   * @param resourceId id of the resource as given by this.resources[0].id
   * @param options Fetch options
   */
  async fetch<T>(path: string, resourceId: string, options: RequestInit = {}) {
    const url = `${API_ENDPOINT}/ex/${this.service}/${resourceId}${path}`;

    const response = await fetch(url, {
      ...options,
      headers: this.headers,
    });
    const json = await response.json();
    return json as T;
  }
}
