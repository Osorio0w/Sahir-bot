const menu = require('../../data/mock/menu.json');
const info = require('../../data/mock/info.json');
const hours = require('../../data/mock/hours.json');

const items = menu.categories.flatMap((c) =>
  c.items.map((i) => ({ ...i, categoryId: c.id, currency: menu.currency, available: i.available !== false }))
);

module.exports = {
  async getCategories() {
    return menu.categories.map(({ id, name }) => ({ id, name }));
  },
  async getItemsByCategory(categoryId) {
    return items.filter((i) => i.categoryId === categoryId);
  },
  async getItem(id) {
    return items.find((i) => i.id === id) || null;
  },
  async getOpeningHours() {
    return hours;
  },
  async getInfo() {
    return info;
  },
};
