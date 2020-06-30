const path = require('path');
const webpack = require('webpack');


const plugins = [];

if (process.env.NODE_ENV == 'production') {
    plugins.push(
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: JSON.stringify('production'),
            },
        }),
    );
    plugins.push(new webpack.optimize.OccurrenceOrderPlugin());
    plugins.push(new webpack.optimize.UglifyJsPlugin());
}

const modulesDirectory = path.join(__dirname, 'node_modules');

module.exports = {
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
        loaders: [
            {
                test: /\.(js|jsx)$/,
                loader: 'babel-loader',
                exclude: /node_modules/
            },
            {
                test: /\.(less|css)$/,
                loader: 'style-loader!css-loader!less-loader',
            },
            {
                test: /\.(woff|woff2|eot|ttf|svg|png)$/,
                loader: 'url-loader',
            },
        ]
    }
}
