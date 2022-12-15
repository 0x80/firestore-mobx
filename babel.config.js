module.exports = {
  // Babel >= 7.13.0 (https://babeljs.io/docs/en/assumptions)
  plugins: [["@babel/plugin-proposal-class-properties"]],
  assumptions: {
    setPublicClassFields: false,
  },

  presets: [
    [
      "@babel/preset-env",
      {
        targets: {
          node: "current",
        },
      },
    ],
    "@babel/preset-typescript",
  ],
};
