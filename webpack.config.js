/* global __dirname process */

const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');


const plugins = [
    new MiniCssExtractPlugin(),
    // Ignore moment/locale, see: https://github.com/moment/moment/issues/2416
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
];
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
const getAppMainFile = app => path.join(
    __dirname, 'kanmail', 'client', 'components', app, 'main.js',
);

module.exports = {
    mode: mode,
    plugins: plugins,
    entry: {
        emails: getAppMainFile('emails'),
        send: getAppMainFile('send'),
        settings: getAppMainFile('settings'),
        contacts: getAppMainFile('contacts'),
        license: getAppMainFile('license'),
        meta: getAppMainFile('meta'),
        metaFile: getAppMainFile('metaFile'),
    },
    output: {
        path: path.join(__dirname, 'dist'),
        publicPath: '/static/dist/',
        filename: '[name].js',
    },
    devServer: {
        port: 4421,
        contentBase: path.join(__dirname, 'kanmail', 'client', 'static'),
        publicPath: '/static/dist/',
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
    optimization: {
        minimizer: [
            new TerserJSPlugin({
                terserOptions: {
                    mangle: false,
                    keep_classnames: true,
                    keep_fnames: true,
                },
            }),
            new OptimizeCSSAssetsPlugin({}),
        ],
        splitChunks: {
            cacheGroups: {
                shared: {
                    name: 'shared',
                    chunks: 'initial',
                    minChunks: 2,
                },
            }
        },
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: ['babel-loader'],
            },
            {
                test: /\.(less|css)$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader',
                    'less-loader',
                ],
            },
            {
                test: /\.(woff|woff2|eot|ttf|svg|png)$/,
                use: ['file-loader'],
            },
        ],
    },
}
