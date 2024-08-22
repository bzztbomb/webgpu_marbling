const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");
const fs = require("fs");

module.exports = {
  entry: "./src/index.ts",
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.wgsl/,
        loader: "webpack-wgsl-loader",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: "",
      template: "./src/index.html",
    }),
  ],
  devServer: {
    static: path.join(__dirname, "public"),
    compress: true,
    port: 4000,
    hot: true,
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer) {
        throw new Error("webpack-dev-server is not defined");
      }

      const images = fs.readdirSync("public/images");

      devServer.app.get("/i", (_, response) => {
        response.send(images[Math.floor(Math.random() * images.length)]);
      });

      return middlewares;
    },
  },
};
