/**
 * Domain normalization utilities for consistent site matching
 */

export function normalizeDomain(url: string): string {
  if (!url) return "";

  try {
    // Handle cases where URL doesn't have protocol
    let normalizedUrl = url.trim();
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const urlObj = new URL(normalizedUrl);
    let domain = urlObj.hostname.toLowerCase();

    // Remove www. prefix
    if (domain.startsWith("www.")) {
      domain = domain.substring(4);
    }

    // Handle special cases for common services
    const specialDomains: { [key: string]: string } = {
      "accounts.google.com": "google.com",
      "mail.google.com": "google.com",
      "drive.google.com": "google.com",
      "docs.google.com": "google.com",
      "login.microsoftonline.com": "microsoft.com",
      "outlook.live.com": "microsoft.com",
      "signin.aws.amazon.com": "aws.amazon.com",
      "console.aws.amazon.com": "aws.amazon.com",
      "auth.atlassian.com": "atlassian.com",
      "id.atlassian.com": "atlassian.com",
      "login.yahoo.com": "yahoo.com",
      "secure.netflix.com": "netflix.com",
      "signin.ebay.com": "ebay.com",
      "auth0.com": "auth0.com",
      "login.salesforce.com": "salesforce.com",
      "github.com": "github.com",
      "gitlab.com": "gitlab.com",
      "bitbucket.org": "bitbucket.org",
    };

    return specialDomains[domain] || domain;
  } catch (error) {
    // If URL parsing fails, try to extract domain manually
    const cleanUrl = url.replace(/^https?:\/\//, "").replace(/^www\./, "");
    const domain = cleanUrl
      .split("/")[0]
      .split("?")[0]
      .split("#")[0]
      .toLowerCase();
    return domain || url.toLowerCase();
  }
}

export function searchDomains(searchTerm: string, domains: string[]): string[] {
  const normalizedSearch = searchTerm.toLowerCase();

  return domains.filter((domain) => {
    const normalizedDomain = domain.toLowerCase();
    return (
      normalizedDomain.includes(normalizedSearch) ||
      normalizedSearch.includes(normalizedDomain) ||
      normalizedDomain.endsWith("." + normalizedSearch) ||
      normalizedSearch.endsWith("." + normalizedDomain)
    );
  });
}

export function getDomainScore(domain: string, searchTerm: string): number {
  const normalizedDomain = domain.toLowerCase();
  const normalizedSearch = searchTerm.toLowerCase();

  // Exact match gets highest score
  if (normalizedDomain === normalizedSearch) return 1;

  // Subdomain match gets high score
  if (normalizedDomain.endsWith("." + normalizedSearch)) return 0.9;

  // Contains search term gets medium score
  if (normalizedDomain.includes(normalizedSearch)) return 0.7;

  // Search term contains domain gets lower score
  if (normalizedSearch.includes(normalizedDomain)) return 0.5;

  return 0;
}
