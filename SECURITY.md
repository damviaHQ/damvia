# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (<https://github.com/damviaHQ/damvia/security/advisories/new>). Do not open a public issue, pull request or discussion for a suspected vulnerability.

Include what you can of:

- the affected version or commit, and the configuration that matters (sign-in mode, single sign-on, storage provider);
- the steps to reproduce, and what an attacker gains;
- whether you have seen it exploited.

## What happens next

| Step | Target |
|---|---|
| Acknowledgement | 3 working days |
| First assessment and severity | 10 working days |
| Fix released for a critical or high severity issue | 30 days |
| Fix released for a medium or low severity issue | next planned release |

We keep you informed, agree a disclosure date with you (90 days from the report at most, sooner once a fix is out), publish a GitHub security advisory with a CVE when one applies, and credit you unless you prefer otherwise.

## Supported versions

Security fixes go into the latest release. Upgrade to it to receive them; [Upgrading](docs/deployment/upgrading.md) describes each migration.

## Scope

In scope: the server (`server/`), the client (`client/`), their dependencies as shipped, the Dockerfile and the documented deployment.

Out of scope: the security of a particular deployment (reverse proxy, TLS, storage and network configuration), which is the operator's. The [security documentation](docs/deployment/security.md) lists what an operator must set up. Also out of scope: denial of service through sheer volume, and reports from automated scanners without a demonstrated impact.

## Supply chain

- Dependabot proposes dependency updates weekly; CI fails on a known high or critical vulnerability in production dependencies (`npm audit`).
- CodeQL analyses every pull request.
- GitHub Actions are pinned to commit SHAs.
- Each release carries a CycloneDX software bill of materials for the server and the client (`damvia-server-sbom.cdx.json`, `damvia-client-sbom.cdx.json`).
