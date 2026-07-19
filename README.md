# AWS SAP-C02 TestMaster

**AWS SAP-C02 TestMaster** is a professional-grade, browser-based practice platform for the AWS Certified Solutions Architect – Professional (SAP-C02) certification. It is designed to simulate the real exam experience while offering multiple study modes for continuous, effective preparation.

This application is built with vanilla JavaScript, HTML, and CSS, emphasizing a clean, modular, and maintainable architecture without reliance on external frameworks.

## Features

The platform is organized into several practice modes, each tailored for a different study approach.

### Practice Modes

-   **Random Test**: A flexible session where you can answer randomly selected questions one by one and receive immediate feedback. Ideal for quick, focused practice.
-   **Timed Quiz**: A 20-question, 40-minute quiz that mimics a subsection of the exam. Answers are saved as you progress, and results are provided upon completion.
-   **Mock Exam**: A full 75-question, 3-hour simulation of the SAP-C02 exam. It includes features like marking questions for review, a question palette for easy navigation, and a final submission process.
-   **Statistics**: A dashboard that provides analytics on your performance, including average scores, domain-specific strengths and weaknesses, and attempt history.
-   **Upload**: Import a custom question bank from a formatted `.docx` file, which is parsed and saved to the browser's local storage for use in all practice modes.

### Core Functionality

-   **Responsive Design**: Fully responsive UI that adapts to desktop, tablet, and mobile devices.
-   **Multiple Question Sets**: The application can load and manage multiple JSON-based question banks, plus custom sets imported via the Upload mode.
-   **State Persistence**: Exam and quiz progress is saved to `LocalStorage`, allowing you to resume sessions even after closing or refreshing the browser.
-   **Dynamic Timers**: Each timed mode features a persistent countdown timer with visual cues for low-time warnings.
-   **Performance Analytics**: Visual charts and detailed tables track your progress over time, helping you identify areas for improvement.
-   **Accessibility**: The UI is designed with accessibility in mind, including keyboard navigation, ARIA attributes, and high-contrast dark mode.

## Tech Stack

-   **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6)
-   **Data**: Questions are loaded from JSON files or imported from `.docx` uploads.
-   **Storage**: `LocalStorage` API for session and statistics persistence.
-   **Analytics**: Chart.js for rendering performance charts.

## Project Structure

The codebase is organized into modules for clear separation of concerns.

```
aws-sap-c02-testmaster/
├── index.html               # Main application shell
├── css/
│   ├── style.css            # Base styles
│   ├── dark.css             # Dark mode theme
│   └── responsive.css       # Responsive design rules
├── js/
│   ├── app.js                # Main application entry point
│   ├── analytics.js          # Statistics and charting module
│   ├── exam.js               # Shared exam-session state shell
│   ├── mock.js               # Mock Exam mode logic
│   ├── quiz.js               # Timed Quiz mode logic
│   ├── random.js             # Random Test mode logic
│   ├── question-engine.js    # Core question model and fallback question set
│   ├── questions.js          # Question engine for loading and normalization
│   ├── question-loader.js    # Manages loading of question sets
│   ├── upload.js             # Parses and imports custom .docx question banks
│   ├── storage.js            # LocalStorage abstraction layer
│   ├── timer.js              # Countdown timer factory
│   ├── ui.js                 # UI navigation and theme management
│   ├── utils.js              # General utility functions
│   └── view-helpers.js       # Shared DOM rendering functions
├── data/
│   ├── set1.json             # Primary question bank
│   └── questions.sample.json # Sample questions
└── README.md
```

## Getting Started

This is a pure client-side application with no build dependencies.

1.  Clone the repository or download the source files.
2.  Open the `index.html` file in a modern web browser (like Chrome, Firefox, or Edge).

For the best experience and to avoid potential browser security restrictions (like CORS errors when fetching the local `set1.json` file), it is recommended to serve the files using a simple local web server:

```bash
# From the project's root directory
python -m http.server
```

Then, navigate to `http://localhost:8000` in your browser.

## How It Works

1.  **Initialization**: `app.js` initializes all modules and sets up the main application state.
2.  **Navigation**: `ui.js` handles view switching based on URL hashes (`#random`, `#timed`, `#mock`, `#stats`, `#upload`) and user interactions.
3.  **Question Loading**: `question-loader.js` and `questions.js` work together to fetch, parse, and normalize questions from the specified JSON file (`data/set1.json` by default), while `question-engine.js` defines the core question model and fallback questions.
4.  **Exam Modes**: Each mode (`random.js`, `quiz.js`, `mock.js`) manages its own state, user interactions, and rendering logic, building on the shared session shell in `exam.js` and helpers from `view-helpers.js`.
5.  **Custom Question Banks**: `upload.js` parses a user-provided `.docx` file into the application's question format and persists it via `storage.js` for use across all modes.
6.  **State Management**: `storage.js` provides a simple API for saving and retrieving data from `LocalStorage`, ensuring that progress is not lost.
7.  **Analytics**: `analytics.js` reads attempt history from storage and uses Chart.js to visualize performance data.

## Question Upload Format

To successfully import new questions via the Upload mode, the `.docx` file must follow a strict format:

-   Each question block must be separated by three dashes (`---`).
-   The file must contain a minimum of 50 questions.

**Structure for each question:**

```
Question 1: [The question text, which can span multiple lines...]
Type: [Single Choice/Multiple Choice]
Domain: [e.g., Design for New Solutions]
A. [Option A text]
B. [Option B text]
C. [Option C text]
D. [Option D text]
...
Answer: [Correct letter(s), e.g., A or A,C]
Explanation: [Detailed explanation text, which can span multiple lines...]
---
```

## Future Improvements

-   **Question Set Selector**: A UI to allow users to switch between multiple saved question banks.
-   **Detailed Review Mode**: An enhanced results screen where users can review each question, their answer, the correct answer, and the explanation.
-   **Cloud-Based Sync**: Option to sync progress and statistics across devices using a backend service.

---
