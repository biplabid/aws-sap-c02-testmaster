(function () {
  const docUploader = document.getElementById('docUploader');
  const parseFileButton = document.getElementById('parseFileButton');
  const uploadStatus = document.getElementById('uploadStatus');

  // Ensure all required elements and libraries are available
  if (!docUploader || !parseFileButton || !uploadStatus || typeof mammoth === 'undefined' || !window.TestMaster || !window.TestMaster.storage) {
    console.error('Upload feature dependencies are missing.');
    if (uploadStatus) {
      setStatus('Error: Upload component failed to initialize.', true);
    }
    return;
  }

  parseFileButton.addEventListener('click', handleFileUpload);

  /**
   * Handles the file selection and initiates the parsing process.
   */
  function handleFileUpload() {
    if (docUploader.files.length === 0) {
      setStatus('Please select a .docx file first.', true);
      return;
    }

    const file = docUploader.files[0];
    const reader = new FileReader();

    reader.onload = function (event) {
      setStatus('Parsing file...');
      mammoth.extractRawText({ arrayBuffer: event.target.result })
        .then(result => {
          const questions = parseDocxText(result.value);
          if (questions && questions.length > 0) {
            saveQuestionSet(questions);
          }
        })
        .catch(err => {
          console.error('Error parsing .docx file:', err);
          setStatus('Failed to read the .docx file. It might be corrupted or in an unsupported format.', true);
        });
    };

    reader.onerror = function () {
      setStatus('An error occurred while reading the file.', true);
    };

    reader.readAsArrayBuffer(file);
  }

  /**
   * Parses the raw text extracted from the .docx file into a question array.
   * @param {string} text - The raw text content from the document.
   * @returns {Array|null} An array of question objects or null if validation fails.
   */
  function parseDocxText(text) {
    const questionBlocks = text.split('---').map(b => b.trim()).filter(b => b);

    if (questionBlocks.length < 50) {
      setStatus(`Error: The file must contain at least 50 questions. Found ${questionBlocks.length}.`, true);
      return null;
    }

    const parsedQuestions = [];
    for (const block of questionBlocks) {
      const lines = block.split('\n').map(l => l.trim());
      const question = { options: [], answer: [] };
      let currentSection = null;

      for (const line of lines) {
        if (!line) continue; // Skip empty lines

        if (/^Question\s*\d*:/i.test(line)) {
          question.prompt = line.replace(/^Question\s*\d*:/i, '').trim();
          currentSection = 'prompt';
        } else if (line.startsWith('Type:')) {
          question.type = line.substring(5).trim();
          currentSection = 'type';
        } else if (line.startsWith('Domain:')) {
          question.domain = line.substring(7).trim();
          currentSection = 'domain';
        } else if (line.match(/^[A-Z]\.\s/)) {
          question.options.push({
            letter: line.substring(0, 1),
            text: line.substring(3).trim()
          });
          currentSection = 'options';
        } else if (line.startsWith('Answer:')) {
          question.answer = line.substring(7).trim().split(',').map(a => a.trim());
          currentSection = 'answer';
        } else if (line.startsWith('Explanation:')) {
          question.explanation = line.substring(12).trim();
          currentSection = 'explanation';
        } else if (currentSection === 'explanation' && question.explanation) {
          question.explanation += `\n${line}`;
        } else if (currentSection === 'prompt' && question.prompt) {
          question.prompt += `\n${line}`;
        }
      }

      // Basic validation for a parsed question
      if (question.prompt && question.type && question.options.length > 0 && question.answer) {
        parsedQuestions.push(question);
      }
    }

    return parsedQuestions;
  }

  /**
   * Converts a raw parsed question block into the canonical shape used by
   * the bundled data/setN.json files (id, question, options[{id,text}], ...).
   * @param {Object} raw - A question parsed from the .docx text.
   * @param {number} index - The question's position in the set.
   * @returns {Object} The canonical question object.
   */
  function toCanonicalQuestion(raw, index) {
    return {
      id: index + 1,
      type: /multi/i.test(raw.type || '') ? 'multiple' : 'single',
      domain: raw.domain || 'General',
      difficulty: 'Professional',
      question: raw.prompt,
      options: raw.options.map((option) => ({ id: option.letter, text: option.text })),
      answer: raw.answer,
      explanation: raw.explanation || ''
    };
  }

  /**
   * Writes the new set of questions to the project's data/ folder as the
   * next available setN.json file, via the File System Access API.
   * @param {Array} questions - The array of parsed question objects.
   */
  async function saveQuestionSet(questions) {
    const fileSets = window.TestMaster.fileSets;

    if (!fileSets || !fileSets.isSupported()) {
      setStatus("Saving files directly isn't supported in this browser. Please use Chrome or Edge to import a question set.", true);
      return;
    }

    setStatus('Choose this project\'s "data" folder to save the new question set...');

    try {
      const canonicalQuestions = questions.map(toCanonicalQuestion);
      const fileName = await fileSets.writeQuestionSetFile(canonicalQuestions);

      setStatus(`Success! Saved ${canonicalQuestions.length} questions to data/${fileName}. It now appears as a selectable set in Random Test.`, false);
      docUploader.value = ''; // Clear the file input
    } catch (error) {
      if (error && error.name === 'AbortError') {
        setStatus('No folder was selected, so the question set was not saved.', true);
      } else {
        console.error('Error saving question set to disk:', error);
        setStatus(error.message || 'An error occurred while saving the new question set.', true);
      }
    }
  }

  /**
   * Displays a status message to the user.
   * @param {string} message - The message to display.
   * @param {boolean} isError - Whether the message is an error.
   */
  function setStatus(message, isError = false) {
    uploadStatus.textContent = message;
    uploadStatus.className = `upload-status ${isError ? 'error' : 'success'}`;
  }
})();
