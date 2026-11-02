# Security reporting

Report suspected vulnerabilities privately through
[GitHub's Report a vulnerability form](https://github.com/comino/LibreChessVR/security/advisories/new).
Do not publish exploit details, account tokens or signing material in an issue or pull request.

Include the affected commit or deployed URL, browser/headset version, impact, and minimal
steps to reproduce using a test account or synthetic data. Remove credentials and personal
data from logs and screenshots. A suggested fix is welcome but not required. Please give
maintainers time to investigate and agree on disclosure before publishing the details;
this small project does not promise a fixed response time.

Security fixes target the current `main` branch and maintained deployment. Historical
commits and third-party forks do not receive separate backports. Ordinary bugs and support
questions belong in [Issues](https://github.com/comino/LibreChessVR/issues).

LibreChessVR runs in the browser and can store a Lichess token locally. If you suspect a
token was exposed, revoke it in your Lichess account; removing it from a file or browser
alone does not revoke it. Never send a live token with a vulnerability report.
