import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Firestore MobX",
  description: "Observable Firestore documents and collections using MobX",
  base: "/",
  cleanUrls: true,

  themeConfig: {
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Introduction", link: "/" },
          { text: "Getting Started", link: "/getting-started" },
          { text: "Observable Document", link: "/observable-document" },
          { text: "Observable Collection", link: "/observable-collection" },
          { text: "Building Stores", link: "/building-stores" },
        ],
      },
      {
        text: "Topics",
        items: [
          { text: "Lazy Loading", link: "/lazy-loading" },
          { text: "Related Projects", link: "/related-projects" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/0x80/firestore-mobx" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright &copy; Thijs Koerselman",
    },
  },
});
