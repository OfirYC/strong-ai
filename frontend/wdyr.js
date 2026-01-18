// wdyr.js (Hermes-safe)
if (__DEV__) {
  // Ensure group logging doesn't hide output in RN consoles
  console.groupCollapsed = console.groupCollapsed || console.log;
  console.group = console.group || console.log;
  console.groupEnd = console.groupEnd || (() => {});

  const React = require("react");
  const whyDidYouRender = require("@welldone-software/why-did-you-render");

  console.log("WDYR: patching React", { version: React.version });

  whyDidYouRender(React, {
    trackAllComponents: true, // prove it works first
    trackHooks: true,
    collapseGroups: false,
    // trackExtraHooks: ["useTimer"], // Example of ignoring a custom hook
    groupByComponent: true,
  });

  console.log("WDYR: ready");
}
