async function grounding_with_google(params, userSettings) {
  const apiKey = userSettings.apiKey;
  if (!apiKey) { return "Error: Gemini API key is required."; }
  const model = userSettings.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestData = { contents: [{ parts: [{ text: params.question }] }], tools: [{ googleSearch: {} }], };
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData), });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP error! Status: ${response.status}, Error Data: ${JSON.stringify(errorData)}, Error Text: ${errorText}`);
    }
    const responseData = await response.json();
    let answerText = responseData.candidates?.[0]?.content?.parts?.map(part => part.text).join('') || '';
    let sourcesMarkdown = "";
    const sourceMap = new Map();
    let sourceCounter = 1;
    if (responseData.candidates?.[0]?.groundingMetadata) {
      const groundingMetadata = responseData.candidates[0].groundingMetadata;
      sourcesMarkdown = groundingMetadata.groundingChunks?.map(chunk => {
        if (chunk.web?.uri) {
          if (!sourceMap.has(chunk.web.uri)) { sourceMap.set(chunk.web.uri, sourceCounter++); }
          const sourceNumber = sourceMap.get(chunk.web.uri);
          return `${sourceNumber}. [${chunk.web.title}](${chunk.web.uri})`;
        }
        return '';
      }).filter(Boolean).join('\n') || '';
      groundingMetadata.groundingSupports?.forEach(support => {
        if (support.segment?.text && support.groundingChunkIndices) {
          let citations = [];
          let citationLinks = [];
          support.groundingChunkIndices.forEach(index => {
            const chunk = groundingMetadata.groundingChunks?.[index];
            if (chunk?.web?.uri) {
              const num = sourceMap.get(chunk.web.uri);
              if (!citations.includes(num)) {
                citations.push(num);
                citationLinks.push(chunk.web.uri);
              }
            }
          });
          citations.sort((a, b) => a - b);
          const citationString = citations.map((num, index) => `[${num}](${citationLinks[index]})`).join("");
          answerText = answerText.replace(support.segment.text, support.segment.text + citationString);
        }
      });
    }
    let markdownResponse = "**Answer:**\n\n" + answerText;
    if (sourcesMarkdown) { markdownResponse += "\n\n**Sources:**\n\n" + sourcesMarkdown; }
const instruction = "\n\n**Instruction:** Write your response in Markdown format. Ensure that all in-text citation numbers (e.g., [1], [2]) are formatted as clickable links using the syntax [number](URL), and all sources in the references section are formatted with alternative text as clickable links using the syntax [alt text](URL).";
    return markdownResponse + instruction;
  } catch (error) {
    console.error('Error:', error);
    return `Error: ${error.message}`;
  }
}
