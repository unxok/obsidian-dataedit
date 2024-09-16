import nested from "postcss-nested";
import vars from "postcss-simple-vars";

export default {
  plugins: [vars(), nested()],
};
