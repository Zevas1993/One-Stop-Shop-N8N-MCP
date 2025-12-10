import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio"; // If available, otherwise regex

const htmlPath = "C:\\Users\\Chris Boyd\\Downloads\\n8n Public API UI.html";

try {
  const html = fs.readFileSync(htmlPath, "utf8");
  console.log(`Read ${html.length} bytes.`);

  // 1. Try to find the full OpenAPI spec in a script tag
  // Look for "spec": or "swagger-ui-init"
  const specMatch = html.match(/["']spec["']\s*:\s*({[\s\S]*?})/);

  if (specMatch) {
    console.log("Found spec object!");
    try {
      // It might be a JS object, not valid JSON (keys not quoted).
      // We might need to use a safer parser or just print it.
      // For now, let's print the first 500 chars to see what it looks like.
      console.log(specMatch[1].substring(0, 500));

      // Attempt to parse if it looks like JSON
      const spec = JSON.parse(specMatch[1]);
      console.log("Successfully parsed JSON spec.");
      if (spec.components && spec.components.schemas) {
        console.log("Found schemas:");
        console.log(
          JSON.stringify(Object.keys(spec.components.schemas), null, 2)
        );

        if (spec.components.schemas.Workflow) {
          console.log("\nWorkflow Schema:");
          console.log(
            JSON.stringify(spec.components.schemas.Workflow, null, 2)
          );
        }
        if (spec.components.schemas.Node) {
          console.log("\nNode Schema:");
          console.log(JSON.stringify(spec.components.schemas.Node, null, 2));
        }
      }
    } catch (e) {
      console.log(
        "Could not parse spec as JSON directly. It might be a JS object."
      );
      // If it's a JS object, we might need to eval it (unsafe but okay for this local file) or use regex to extract specific parts.
    }
  } else {
    console.log("Did not find 'spec': {...} pattern.");

    // 2. Look for rendered HTML models
    // <div id="model-workflow" ...>
    // We can use regex to find data-name="workflow" and extract the content.
    // The content is likely in the HTML structure.

    console.log("Searching for data-name attributes...");
    const dataNameRegex = /data-name="([^"]+)"/g;
    let match;
    const foundModels = [];
    while ((match = dataNameRegex.exec(html)) !== null) {
      foundModels.push(match[1]);
    }
    console.log("Found models in HTML:", foundModels);

    // Extract Workflow schema details
    const extractModel = (modelName: string) => {
      console.log(`\n--- Extracting ${modelName} ---`);
      const modelRegex = new RegExp(
        `data-name="${modelName}"[\\s\\S]*?class="inner-object"([\\s\\S]*?)<\\/span><\\/span><\\/div><\\/div>`,
        "i"
      );
      // This regex is fragile, let's try to just find the start and print a chunk
      const startRegex = new RegExp(`data-name="${modelName}"`);
      const startMatch = html.match(startRegex);
      if (startMatch && startMatch.index !== undefined) {
        const start = startMatch.index;
        const chunk = html.substring(start, start + 5000); // Read 5KB chunk

        // Clean up HTML tags to make it readable
        const text = chunk
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        console.log(text);
      } else {
        console.log(`Model ${modelName} not found.`);
      }
    };

    extractModel("Workflow");
    extractModel("Node");
    extractModel("workflow"); // Case sensitive check
    extractModel("node");

    // Check for specific node types
    const specificTypes = ["WorkflowSettings", "Tag", "Execution"];
    specificTypes.forEach((type) => {
      extractModel(type);
      extractModel(type.toLowerCase());
    });

    // Look for required fields (often marked with *)
    console.log("\n--- Searching for Required Fields ---");
    // This regex looks for property names followed by a * which usually indicates required in Swagger UI
    const requiredFieldRegex =
      /<span class="prop-name required">(\w+)<\/span>/g;
    let reqMatch;
    const requiredFields = new Set<string>();
    while ((reqMatch = requiredFieldRegex.exec(html)) !== null) {
      requiredFields.add(reqMatch[1]);
    }
    console.log(
      "Potential Required Fields (global list):",
      Array.from(requiredFields)
    );
  }
} catch (error) {
  console.error("Error reading file:", error);
}
