const welcome =
  '# Welcome to Notes\n\nA clean, powerful Markdown editor for your thoughts, ideas, and\neverything in between.\n\n## Why Markdown?\n- Simple and readable\n- Works everywhere\n- Focus on your content, not the tools\n- Perfect for notes, docs, and knowledge management\n\n## Features\n- [x] Live preview\n- [x] Beautiful and minimal UI\n- [ ] Organize with folders and tags\n- [ ] Export to multiple formats\n- [ ] Sync across devices\n\n## Code Example\n```javascript\n// A simple greeting function\nfunction greet(name) {\n   return `Hello, ${name}!`;\n}\n\nconsole.log(greet("World"));\n```\n\n## A Note\n> Great ideas start with a simple note.\n> Keep writing. Keep exploring.\n\n## Table\n| Feature           | Description               | Status        |\n| ---               | ---                       | ---           |\n| Live Preview      | See changes in real time  | ✅ Done       |\n| File Organization | Folders, tags, favorites   | ✅ Done       |\n| Export            | PDF, HTML, Markdown       | 🚧 In Progress |\n| Sync              | Across your devices       | ⏳ Planned    |';
const names = [
  "Getting Started",
  "Product Ideas",
  "Meeting Notes",
  "Roadmap",
  "Changelog",
  "README",
  "Ideas",
  "Design Principles",
  "Daily Journal",
  "Reading List",
  "Quick Notes",
  "Writing Guide",
  "Old Drafts",
  "2025 Notes",
];
module.exports = {
  welcome,
  seeds: names.map((name, i) => ({
    id: `sample-${i + 1}`,
    name: name + ".md",
    content:
      i === 0
        ? welcome
        : `# ${name}\n\n${i === 1 ? "A little space for the next big idea.\n\n## Ideas\n- [ ] Capture a problem worth solving\n- [ ] Sketch a small solution\n- [ ] Share it and learn" : i === 3 ? "## Now\n- [x] Make space for focused writing\n- [ ] Build a daily writing habit\n\n## Next\n- [ ] Share something useful" : "Your thoughts belong here.\n\n## Notes\n\nStart writing…"}\n`,
    folders: [
      ...(i < 8 ? ["Personal"] : []),
      ...([1, 2, 3, 4].includes(i) ? ["Projects"] : []),
      ...([0, 5, 7, 9, 10, 11].includes(i) ? ["Learning"] : []),
    ],
    tags: [
      ...(i < 4 ? ["productivity"] : []),
      ...([1, 6, 10].includes(i) ? ["ideas"] : []),
      ...([1, 3, 4, 5].includes(i) ? ["development"] : []),
      ...([2, 8, 10].includes(i) ? ["personal"] : []),
      ...([0, 2, 5, 6, 8, 10].includes(i) ? ["notes"] : []),
    ],
    favorite: [5, 6, 7].includes(i),
    archived: i > 11,
    trash: false,
    updatedAt: Date.now(),
  })),
};
