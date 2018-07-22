const path = require('path');
const home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
const modulesDirectory = 'node_modules';


module.exports = {
    entry: path.join(__dirname, 'kanmail', 'client', 'main.jsx'),
    output: {
        path: path.join(__dirname, 'dist'),
        filename: 'main.js',
    },
    devServer: {
        contentBase: path.join(__dirname, 'kanmail', 'client', 'static'),
    },
    resolve: {
        modules: [
            path.join(__dirname, 'kanmail', 'client'),
            modulesDirectory,
            // path.join(__dirname, 'node_modules'),
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
                test: /\.(woff|woff2|eot|ttf|svg)$/,
                loader: 'url-loader',
            },
        ]
    }
}
