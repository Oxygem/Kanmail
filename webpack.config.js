const path = require('path');
const webpack = require('webpack');


const plugins = [];
let mode = 'development';

if (process.env.NODE_ENV == 'production') {
    mode = 'production';

    plugins.push(
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify('production'),
            },
        }),
    );
    plugins.push(new webpack.optimize.OccurrenceOrderPlugin());
}

const modulesDirectory = path.join(__dirname, 'node_modules');

module.exports = {
    mode: mode,
    plugins: plugins,
    entry: path.join(__dirname, 'kanmail', 'client', 'main.jsx'),
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'main.js',
    },
    devServer: {
        contentBase: path.join(__dirname, 'kanmail', 'client', 'static'),
        headers: {
            'Access-Control-Allow-Origin': '*',
        },
    },
    resolve: {
        modules: [
            path.join(__dirname, 'kanmail', 'client'),
            modulesDirectory,
        ],
    },
    resolveLoader: {
        modules: [
            modulesDirectory,
        ],
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: [
                    {loader: 'babel-loader'},
                ],
            },
            {
                test: /\.(less|css)$/,
                use: [
                    {loader: 'style-loader'},
                    {loader: 'css-loader'},
                    {loader: 'less-loader'},
                ],
            },
            {
                test: /\.(woff|woff2|eot|ttf|svg|png)$/,
                use: [
                    {loader: 'url-loader'},
                ],
            },
        ]
    }
}
