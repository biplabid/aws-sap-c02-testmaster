window.TestMaster = window.TestMaster || {};

window.TestMaster.analytics = (function createAnalyticsModule(storage, timerFactory, viewHelpers) {
  let domainRadarChart = null;
  let historyBarChart = null;

  function initAnalyticsShell(appState) {
    const elements = getAnalyticsElements();

    if (!elements.content) {
      return;
    }

    window.addEventListener("testmaster:view-change", (event) => {
      if (event.detail.view === "stats") {
        renderAnalytics(elements);
      }
    });

    elements.refresh.addEventListener("click", () => {
      renderAnalytics(elements);
      window.TestMaster.ui.showToast("Statistics have been updated.");
    });
  }

  function getAnalyticsElements() {
    return {
      content: document.querySelector("#statsContent"),
      emptyState: document.querySelector("#statsEmptyState"),
      totalAttempts: document.querySelector("#statsTotalAttempts"),
      averageScore: document.querySelector("#statsAverageScore"),
      bestScore: document.querySelector("#statsBestScore"),
      studyTime: document.querySelector("#statsStudyTime"),
      domainRadarChart: document.querySelector("#domainRadarChart"),
      historyBarChart: document.querySelector("#historyBarChart"),
      historyTableBody: document.querySelector("#statsHistoryTable tbody"),
      refresh: document.querySelector("#statsRefresh")
    };
  }

  function renderAnalytics(elements) {
    const history = storage.loadAttemptHistory();
    const stats = storage.loadStatistics();

    if (history.length === 0) {
      elements.content.classList.add("hidden");
      elements.emptyState.classList.remove("hidden");
      return;
    }

    elements.content.classList.remove("hidden");
    elements.emptyState.classList.add("hidden");

    renderSummaryCards(elements, stats);
    renderDomainChart(elements, history);
    renderHistoryChart(elements, history);
    renderHistoryTable(elements, history);
  }

  function renderSummaryCards(elements, stats) {
    elements.totalAttempts.textContent = stats.attempts;
    elements.averageScore.textContent = stats.averageScore !== null ? `${stats.averageScore}%` : "--";
    elements.bestScore.textContent = stats.bestScore !== null ? `${stats.bestScore}%` : "--";

    const hours = Math.floor(stats.studyTimeSeconds / 3600);
    const minutes = Math.floor((stats.studyTimeSeconds % 3600) / 60);
    elements.studyTime.textContent = `${hours}h ${minutes}m`;
  }

  function renderDomainChart(elements, history) {
    const isDarkMode = document.querySelector(".app-shell[data-theme='dark']");
    const gridColor = isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";
    const labelColor = isDarkMode ? "#f1f1f1" : "#545b64";
    const pointBorderColor = isDarkMode ? "#16191f" : "#fff";

    const domainData = calculateDomainScores(history);
    const labels = Object.keys(domainData);
    const scores = labels.map((label) => domainData[label].score);

    const chartData = {
      labels,
      datasets: [{
        label: "Score by Domain",
        data: scores,
        fill: true,
        backgroundColor: "rgba(255, 153, 0, 0.2)",
        borderColor: "rgb(255, 153, 0)",
        pointBackgroundColor: "rgb(255, 153, 0)",
        pointBorderColor: pointBorderColor,
        pointHoverBackgroundColor: "#fff",
        pointHoverBorderColor: "rgb(255, 153, 0)"
      }]
    };

    if (domainRadarChart) {
      domainRadarChart.data = chartData;
      domainRadarChart.options.scales.r.grid.color = gridColor;
      domainRadarChart.options.scales.r.pointLabels.color = labelColor;
      domainRadarChart.options.scales.r.ticks.color = labelColor;
      domainRadarChart.update();
    } else {
      domainRadarChart = new Chart(elements.domainRadarChart, {
        type: "radar",
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          elements: { line: { borderWidth: 2 } },
          scales: {
            r: {
              angleLines: { display: false },
              suggestedMin: 0,
              suggestedMax: 100,
              grid: { color: gridColor },
              pointLabels: { color: labelColor },
              ticks: {
                color: labelColor,
                backdropColor: "transparent"
              }
            }
          }
        }
      });
    }
  }

  function renderHistoryChart(elements, history) {
    const isDarkMode = document.querySelector(".app-shell[data-theme='dark']");
    const gridColor = isDarkMode ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)";
    const labelColor = isDarkMode ? "#f1f1f1" : "#545b64";
    const recentHistory = history.slice(0, 10).reverse();
    const labels = recentHistory.map((attempt, i) => `Attempt ${history.length - i}`);
    const scores = recentHistory.map((attempt) => attempt.score);

    const chartData = {
      labels,
      datasets: [{
        label: "Score",
        data: scores,
        backgroundColor: scores.map((score) => (score >= 80 ? "rgba(35, 209, 96, 0.5)" : "rgba(255, 99, 132, 0.5)")),
        borderColor: scores.map((score) => (score >= 80 ? "rgb(35, 209, 96)" : "rgb(255, 99, 132)")),
        borderWidth: 1
      }]
    };

    if (historyBarChart) {
      historyBarChart.data = chartData;
      historyBarChart.options.scales.y.grid.color = gridColor;
      historyBarChart.options.scales.y.ticks.color = labelColor;
      historyBarChart.options.scales.x.grid.color = gridColor;
      historyBarChart.options.scales.x.ticks.color = labelColor;
      historyBarChart.update();
    } else {
      historyBarChart = new Chart(elements.historyBarChart, {
        type: "bar",
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              suggestedMax: 100,
              grid: { color: gridColor },
              ticks: { color: labelColor }
            },
            x: {
              grid: { color: gridColor },
              ticks: { color: labelColor }
            }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }

  function renderHistoryTable(elements, history) {
    viewHelpers.clearElement(elements.historyTableBody);
    history.forEach((attempt) => {
      const row = document.createElement("tr");
      const date = new Date(attempt.completedAt).toLocaleDateString();
      const type = attempt.type === "mock" ? "Mock Exam" : "Timed Quiz";

      row.innerHTML = `
        <td>${date}</td>
        <td>${type}</td>
        <td>${attempt.score}%</td>
        <td>${timerFactory.formatTime(attempt.timeUsedSeconds)}</td>
      `;
      elements.historyTableBody.appendChild(row);
    });
  }

  function calculateDomainScores(history) {
    const domainStats = {};

    history.forEach((attempt) => {
      attempt.questions.forEach((q) => {
        const domain = q.domain || "General";
        if (!domainStats[domain]) {
          domainStats[domain] = { correct: 0, total: 0 };
        }

        const answerKey = q.quizId || q.examId || q.id;
        const selected = attempt.answers[answerKey] || [];
        const isCorrect = viewHelpers.isAnswerCorrect(q.correctAnswers, selected);

        domainStats[domain].total += 1;
        if (isCorrect) {
          domainStats[domain].correct += 1;
        }
      });
    });

    return Object.keys(domainStats).reduce((acc, domain) => {
      acc[domain] = {
        ...domainStats[domain],
        score: Math.round((domainStats[domain].correct / domainStats[domain].total) * 100)
      };
      return acc;
    }, {});
  }

  return {
    initAnalyticsShell
  };
})(window.TestMaster.storage, window.TestMaster.timer, window.TestMaster.viewHelpers);
