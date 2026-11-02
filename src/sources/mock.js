export const name = "mock", needsBrowser = false;
const T = [
  ["Mechanical keyboard 75% RGB (barely used)", 1100, "Magalang", 3],
  ["Mechanical keyboard 75% RGB hotswap", 1500, "Angeles", 0],
  ["Mechanical keyboard 75% RGB wireless", 1600, "Mabalacat", 1],
  ["Mechanical keyboard 75% RGB brand new", 1700, "San Fernando", 0],
  ["Mechanical keyboard 75% RGB sealed", 1650, "Tarlac", 0],
  ["iPhone 11 128GB", 9500, "Clark", 11],
];
const WANTED = { kind: "post", title: "WTB mechanical keyboard 75% RGB", description: "WTB mechanical keyboard 75% rgb. Budget ₱1,800. Angeles area", locationText: "Angeles", comments: 2, url: "https://example.test/post/9", seller: { name: "Test Buyer" } };
export const search = async () => [...T.map(([title, price, locationText, comments], i) =>
  ({ title, price, locationText, comments, url: `https://example.test/p/${i}?ref=x`, imageUrl: "" })), WANTED];
