try {
  require("express");
  console.log("express ok");
} catch (e) {
  console.log("express missing", e.message);
}
try {
  require("@prisma/client");
  console.log("prisma ok");
} catch (e) {
  console.log("prisma missing", e.message);
}
try {
  require("dayjs");
  console.log("dayjs ok");
} catch (e) {
  console.log("dayjs missing", e.message);
}
try {
  require("dotenv");
  console.log("dotenv ok");
} catch (e) {
  console.log("dotenv missing", e.message);
}
