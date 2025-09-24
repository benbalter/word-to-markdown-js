# Contributing to Word To Markdown

Hi there! We're thrilled that you'd like to contribute to Word To Markdown. Your help is essential for keeping it great.

Word To Markdown is an open source project supported by the efforts of an entire community and built one contribution at a time by users like you. We'd love for you to get involved. Whatever your level of skill or however much time you can give, your contribution is greatly appreciated. There are many ways to contribute, from writing tutorials or blog posts, improving the documentation, submitting bug reports and feature requests, helping other users by commenting on issues, or writing code which can be incorporated into Word To Markdown itself.

Following these guidelines helps to communicate that you respect the time of the developers managing and developing this open source project. In return, they should reciprocate that respect in addressing your issue, assessing changes, and helping you finalize your pull requests.

## How to report a bug

Think you found a bug? Please check [the list of open issues](https://github.com/benbalter/word-to-markdown-js/issues) to see if your bug has already been reported. If it hasn't please [submit a new issue](https://github.com/benbalter/word-to-markdown-js/issues/new).

Here are a few tips for writing _great_ bug reports:

- Describe the specific problem (e.g., "widget doesn't turn clockwise" versus "getting an error")
- Include the steps to reproduce the bug, what you expected to happen, and what happened instead
- Check that you are using the latest version of the project and its dependencies
- Include what version of the project your using, as well as any relevant dependencies
- Only include one bug per issue. If you have discovered two bugs, please file two issues
- Include screenshots or screencasts whenever possible
- Even if you don't know how to fix the bug, including a failing test may help others track it down

**If you find a security vulnerability, do not open an issue. Please email ben@balter.com instead.**

## How to suggest a feature or enhancement

If you find yourself wishing for a feature that doesn't exist in Word To Markdown, you are probably not alone. There are bound to be others out there with similar needs. Many of the features that Word To Markdown has today have been added because our users saw the need.

Feature requests are welcome. But take a moment to find out whether your idea fits with the scope and goals of the project. It's up to you to make a strong case to convince the project's developers of the merits of this feature. Please provide as much detail and context as possible, including describing the problem you're trying to solve.

[Open an issue](https://github.com/benbalter/word-to-markdown-js/issues/new) which describes the feature you would like to see, why you want it, how it should work, etc.

## What should I do if my document doesn&#39;t convert correctly

1. Strip the Word Document down to isolate the troublesome part (e.g., remove the parts that are converting correctly)
2. Upload the `.doc` or `.docx` file to someplace like DropBox
3. [Open a new issue](https://github.com/benbalter/word-to-markdown-js/issues/new) describing the particular problem. Be sure to include a link to the uploaded file.

A few tips for reporting conversion issues:

- Explain the expected output, actual output, and steps to reproduce
- Include screenshots of the expected and actual output
- Issues should be limited to one conversation error and describe it in detail
- Issues that report &quot;My document won&#39;t convert&quot; or &quot;I have these three problems&quot; are less likely to be resolved quickly
- Be sure to include what version of Microsoft Word was used to create the document

## Your first contribution

We'd love for you to contribute to the project. Unsure where to begin contributing to Word To Markdown? You can start by looking through these "good first issue" and "help wanted" issues:

- [Good first issues](https://github.com/benbalter/word-to-markdown-js/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) - issues which should only require a few lines of code and a test or two
- [Help wanted issues](https://github.com/benbalter/word-to-markdown-js/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) - issues which may be a bit more involved, but are specifically seeking community contributions

_p.s. Feel free to ask for help; everyone is a beginner at first_ :smiley_cat:

## How to propose changes

Here's a few general guidelines for proposing changes:

- If you are changing any user-facing functionality, please be sure to update the documentation
- If you are adding a new behavior or changing an existing behavior, please be sure to update the corresponding test(s)
- Each pull request should implement **one** feature or bug fix. If you want to add or fix more than one thing, submit more than one pull request
- Do not commit changes to files that are irrelevant to your feature or bug fix
- Don't bump the version number in your pull request (it will be bumped prior to release)
- Write [a good commit message](http://tbaggery.com/2008/04/19/a-note-about-git-commit-messages.html)

At a high level, [the process for proposing changes](https://guides.github.com/introduction/flow/) is:

1. [Fork](https://github.com/benbalter/word-to-markdown-js/fork) and clone the project
2. Configure and install the dependencies: `script/bootstrap`
3. Make sure the tests pass on your machine: `script/cibuild`
4. Create a descriptively named branch: `git checkout -b my-branch-name`
5. Make your change, add tests and documentation, and make sure the tests still pass
6. Push to your fork and [submit a pull request](https://github.com/benbalter/word-to-markdown-js/compare) describing your change
7. Pat your self on the back and wait for your pull request to be reviewed and merged

**Interesting in submitting your first Pull Request?** It's easy! You can learn how from this _free_ series [How to Contribute to an Open Source Project on GitHub](https://egghead.io/series/how-to-contribute-to-an-open-source-project-on-github)

## Bootstrapping your local development environment

`script/bootstrap`

## Running tests

`script/cibuild`

## Code of conduct

This project is governed by [the Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Additional Resources

- [Contributing to Open Source on GitHub](https://guides.github.com/activities/contributing-to-open-source/)
- [Using Pull Requests](https://help.github.com/articles/using-pull-requests/)
- [GitHub Help](https://help.github.com)
