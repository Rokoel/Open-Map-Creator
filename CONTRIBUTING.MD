# Contributing to Open Map Creator 🗺️

First off, thank you for considering contributing to Open Map Creator! We're excited to build a fantastic, free, and open-source TTRPG map-making tool with the community. Your help is greatly appreciated!

This document provides guidelines for contributing to the project. Please read it to help make the contribution process smooth for everyone.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. All contributors are expected to adhere to our [Code of Conduct](./CODE_OF_CONDUCT.MD). Please be respectful and constructive in all interactions.

## How Can I Contribute?

There are many ways to contribute, and not all involve writing code!

*   **Reporting Bugs:** If you find something not working as expected, please let us know.
*   **Suggesting Enhancements:** Have an idea for a new feature or an improvement to an existing one? We'd love to hear it.
*   **Improving Documentation:** Help make the `README.md` or other documentation clearer or more comprehensive.
*   **Writing Code:** Fix bugs or implement new features.
*   **Testing:** Help test new features or verify bug fixes.

## Reporting Bugs 🐞

Before submitting a bug report, please:

1.  **Check Existing Issues:** Search the [GitHub Issues](https://github.com/Rokoel/Open-Map-Creator/issues) to see if the bug has already been reported.
2.  **Provide Details:** If the bug hasn't been reported, create a new issue. Please include:
    *   A clear and descriptive title.
    *   Steps to reproduce the bug reliably.
    *   What you expected to happen.
    *   What actually happened (include screenshots or GIFs if helpful!).
    *   Your browser name and version (e.g., Chrome 115, Firefox 114).
    *   Your operating system (e.g., Windows 11, macOS Ventura, Ubuntu 22.04).
    *   Any error messages shown in the browser's developer console (usually opened with F12).

## Suggesting Enhancements ✨

We welcome suggestions for new features and improvements!

1.  **Check Existing Issues/Discussions:** Search the [GitHub Issues](https://github.com/Rokoel/Open-Map-Creator/issues) and [GitHub Discussions](https://github.com/Rokoel/Open-Map-Creator/discussions) to see if your idea has already been suggested or discussed.
2.  **Create an Issue:** If your idea is new, create a new issue.
    *   Use a clear and descriptive title.
    *   Explain the enhancement you're proposing.
    *   Describe the problem it solves or the use case it enables (the "why").
    *   Provide examples or mockups if possible.

## Code Contributions & Pull Requests 🧑‍💻

Ready to write some code? Awesome! We use the standard GitHub Pull Request workflow for code changes.

**Standard Workflow (Recommended for most changes):**

1.  **Fork the Repository:** Create your own copy of the project on GitHub.
2.  **Clone Your Fork:** Clone your forked repository to your local machine.
    ```bash
    git clone https://github.com/YOUR_FORKED_USERNAME/Open-Map-Creator.git
    cd Open-Map-Creator
    ```
3.  **Create a Branch:** Create a new branch for your changes. Use a descriptive name (e.g., `feature/add-layer-visibility`, `bugfix/pdf-export-scaling`).
    ```bash
    git checkout -b feature/your-feature-name
    ```
4.  **Make Changes:** Write your code!
5.  **Code Style & Formatting:**
    *   Please, try to follow the existing code style.
    *   Write clear, understandable code and add comments where necessary, especially for complex logic.
6.  **Testing:**
    *   Currently, we rely primarily on manual testing. Please test your changes thoroughly in different browsers (Chrome, Firefox recommended).
    *   Describe the testing you performed in your Pull Request description.
    *   Contributions that add automated tests are highly welcome!
7.  **Commit Changes:** Use clear and concise commit messages. Following conventions like [Conventional Commits](https://www.conventionalcommits.org/) is encouraged but not strictly required.
    ```bash
    git add .
    git commit -m "feat: Add layer visibility toggle"
    ```
8.  **Push to Your Fork:** Push your branch to your forked repository on GitHub.
    ```bash
    git push origin feature/your-feature-name
    ```
9.  **Open a Pull Request (PR):**
    *   Go to the original `Rokoel/Open-Map-Creator` repository on GitHub.
    *   GitHub should show a prompt to create a Pull Request from your recently pushed branch.
    *   Target the `main` branch of the original repository (unless otherwise specified).
    *   Provide a clear title and description for your PR. Explain *what* you changed and *why*.
    *   If your PR addresses an existing issue, link it using keywords like `Closes #123`.
    *   Be prepared to discuss your changes and make adjustments based on feedback.

**Simpler Workflow (For typos, documentation, or very minor fixes):**

If you only need to make a small change to a single file (like fixing a typo), you can use GitHub's web interface directly:

1.  Navigate to the file in the main repository on GitHub.
2.  Click the **Edit** (pencil ✏️) icon near the top right of the file view.
3.  Make your changes in the web editor.
4.  Scroll down and enter a concise commit message describing your change.
5.  Ensure "Create a **new branch**..." is selected.
6.  Click **Propose changes**.
7.  On the next screen, click **Create pull request**.

**Note:** This simpler method is great for quick fixes, but you won't be able to test your changes before submitting them. For anything more complex than a minor edit, please use the Standard Workflow.

## Development Setup

This project is designed to run directly in the browser without a build step for core functionality.

1.  Clone the repository (as described above).
2.  Open the `index.html` file in your web browser.

That's it for setting up a development environment. As an alternative, you may setup any local server you'd like.

## License

By contributing, you agree that your contributions will be licensed under the **MIT License**, the same license that covers the project. See the `LICENSE` file for details.

## Questions?

If you have questions about contributing or using the project, feel free to open an issue on GitHub.

---

Thank you again for your interest in contributing to Open Map Creator!