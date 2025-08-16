// src/App.js
import React, { useState } from "react";
import axios from "axios";

export default function App() {
  const [doc, setDoc] = useState("");
  const [output, setOutput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useAI, setUseAI] = useState(false);
  const [loading, setLoading] = useState(false);

  const cleanName = (str) => {
    return str
      .replace(/_IN_SECOND.*$/i, "")
      .replace(/_\d+_.*$/i, "")
      .replace(/_?\d+_?UNUSED/i, "")
      .replace(/TABLE/i, "")
      .replace(/_/g, " ")
      .trim()
      .replace(/\s+/g, "_")
      .toUpperCase();
  };

  const parseLocal = () => {
    const lines = doc.split("\n");
    let results = [];
    let evtMap = {};

    // Extract evt mapping from doc part
    const docPart = lines.filter((l) => !l.startsWith(":ACU"));
    docPart.forEach((line) => {
      let match = line.match(/(\d+)\s*[:=]\s*(.+)/i);
      if (match) {
        const val = match[1].trim();
        const label = match[2].trim();
        evtMap[val] = label.charAt(0).toUpperCase() + label.slice(1);
      }
    });

    // Parse ACU points
    const pointLines = lines.filter((l) => l.startsWith(":ACU"));
    pointLines.forEach((line) => {
      const parts = line.split(":");
      const id = parts[3];
      let name = cleanName(parts[4]);
      let desc = line.match(/"([^"]+)"/)?.[1] || "";
      desc = desc
        .replace(/\s*\(.*?\)/g, "")
        .replace(/\s+-?\d+(\.\d+)?\s*to\s*\+?\d+(\.\d+)?/gi, "")
        .trim();

      let outLine = `:ACU:PNT:FI:${id}:${name}:"${desc}":grp "Slave Table"`;

      // Add events if found
      if (Object.keys(evtMap).length > 0 && (desc.toLowerCase().includes("aos time") || desc.toLowerCase().includes("ephemeris table"))) {
        Object.entries(evtMap).forEach(([val, label]) => {
          outLine += `:evt "${label}"==${val},0:`;
        });
      }

      results.push(outLine);
    });

    setOutput(results.join("\n"));
  };

  const parseAI = async () => {
    setLoading(true);
    try {
      const prompt = `
You are to reformat ACU point data based on documentation.
Rules:
1. Keep format :ACU:PNT:FI:<ID>:<NAME>:"<DESC>":grp "Slave Table"
2. Remove units, ranges, underscores, and unused markers from names.
3. Add evt mappings from value descriptions in doc: format :evt "Label"==<Value>,0:
4. Match exactly the style:
:ACU:PNT:FI:10000:EPHEMERIS_TIME_OFFSET:"Ephemeris Time Offset":grp "Slave Table":
:ACU:PNT:FI:10001:AOS_TIME_FOR_T0_TRIGGER:"AOS Time For T0 Trigger Number Of Second Since Begin Of The Day":grp "Slave Table":evt "Disable"==0,0:
:ACU:PNT:FI:10004:EPHEMERIS_TABLE:"Ephemeris Table":grp "Slave Table":evt "Ephemeris Table 1"==0,0:evt "Ephemeris Table 2"==1,0:
:ACU:PNT:FI:10007:ELEVATION_MINIMUM_ANGLE:"Elevation Minimum Angle":grp "Slave Table":
Input:
${doc}
      `;

      const res = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-4o-mini", // or any OpenRouter-supported model
          messages: [{ role: "user", content: prompt }],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      setOutput(res.data.choices[0].message.content.trim());
    } catch (err) {
      console.error(err);
      alert("AI parsing failed. Check API key and connection.");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>ACU Point Generator</h1>
      <textarea
        rows={12}
        style={{ width: "100%" }}
        placeholder="Paste documentation + point file here..."
        value={doc}
        onChange={(e) => setDoc(e.target.value)}
      />
      <br />
      <input
        type="checkbox"
        checked={useAI}
        onChange={(e) => setUseAI(e.target.checked)}
      />{" "}
      Use OpenRouter AI
      {useAI && (
        <input
          type="password"
          placeholder="OpenRouter API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ width: "100%", marginTop: "5px" }}
        />
      )}
      <br />
      <button onClick={useAI ? parseAI : parseLocal} disabled={loading}>
        {loading ? "Processing..." : "Generate"}
      </button>
      <h3>Output</h3>
      <pre style={{ background: "#f0f0f0", padding: "10px" }}>{output}</pre>
    </div>
  );
}
