/*
* Copyright (c) 2013, Yahoo! Inc. All rights reserved.
* Copyrights licensed under the New BSD License.
* See the accompanying LICENSE file for terms.
*/

/*jslint node:true, nomen:true*/

"use strict";

var YUITest = require('yuitest'),
    A = YUITest.Assert,
    OA = YUITest.ObjectAssert,
    suite,
    mockery = require('mockery'),
    mockShifter,
    mockBuilder,
    PluginClass = require('../../lib/plugin.js');

function createBundles() {
    return {
        photonews: {
            "/tmp/photonews/build/photonews-0.0.1/app.js": {
                "buildfile": "/tmp/photonews/build/photonews-0.0.1/app.js",
                "builds": {
                    "photonews-about-page": {
                        "config": {
                            "requires": [
                                "template-base",
                                "handlebars-base"
                            ]
                        },
                        "name": "photonews-about-page"
                    }
                },
                "name": "photonews-about-page"
            },
            "/tmp/photonews/build/photonews-0.0.1/models/news.js": {
                "buildfile": "/tmp/photonews/build/photonews-0.0.1/models/news.js",
                "builds": {
                    "news-model": {
                        "config": {
                            "requires": [
                                "model"
                            ],
                            "affinity": "client"
                        },
                        "name": "news-model"
                    }
                },
                "name": "news-model"
            }
        }
    };
}

suite = new YUITest.TestSuite("plugin-test suite");

suite.add(new YUITest.TestCase({
    name: "plugin-test",

    setUp: function () {
        mockery.enable({
            useCleanCache: true,
            warnOnReplace: true,
            warnOnUnregistered: true
        });
        mockShifter = YUITest.Mock();
        mockBuilder = function (name, group) {
            this.compile = function (meta) {
                A.isObject(meta);
            };
            this.data = {
                js: 'content of loader-foo.js',
                json: {
                    mod1: 'json version of loader-foo.js'
                }
            };
        };
        mockery.register('./shifter', mockShifter);
        mockery.register('./builder', mockBuilder);
    },

    // PluginClass
    // register
    // getLoaderData
    // bundleUpdated
    // _buildsInBundle
    //
    tearDown: function () {
        mockShifter = null;
        mockBuilder = null;
        mockery.deregisterAll();
        mockery.disable();
    },

    "test require plugin": function () {
        A.isNotNull(PluginClass, "loader require failed");
    },

    "test constructor": function () {
        var plugin = new PluginClass();
        A.isObject(plugin, "failing to create a plugin object");
        A.isObject(plugin.describe, "missing describe member on plugin instance");
        A.isFunction(plugin.bundleUpdated, "missing bundleUpdated member on plugin instance");
        A.isArray(plugin.describe.args, "default shifter options should be honored");
    },

    "test constructor with options": function () {
        var plugin,
            args;

        plugin = new PluginClass({
            filter: /^foo/
        });

        A.isNotUndefined(plugin.describe);
        A.areEqual('*', plugin.describe.types[0]);
        A.isTrue(typeof plugin.describe.options.filter === 'function', 'missing filter function');

        args = plugin.describe.args;
        A.isTrue(args.indexOf('--no-coverage') > -1, 'missing --no-coverage option');
        A.isTrue(args.indexOf('--no-lint') > -1, 'missing --no-lint option');
        // A.isTrue(args.indexOf('--silent') > -1, 'missing --silent option');
        // A.isTrue(args.indexOf('--quiet') > -1, 'missing --quiet option');
        OA.areEqual({}, plugin._bundles, 'this._bundles was not init');
    },

    "test register": function () {
        var plugin = new PluginClass();

        plugin.register('foo', __dirname, 1);
        plugin.register('bar', __filename, 2);
        plugin.register('foo', __dirname, 3);
        A.areSame(3, plugin._bundles.foo[__dirname]);
        A.areSame(2, plugin._bundles.bar[__filename]);
    },

    "test getLoaderData with non-matching bundleName": function () {
        var plugin = new PluginClass(),
            data = plugin.getLoaderData('foo');

        A.isUndefined(data, 'wrong loaderData');
    },

    "test getLoaderData": function () {
        var plugin,
            bundle,
            filter,
            loaderData,
            json;

        plugin = new PluginClass({});

        plugin._bundles = createBundles();
        filter = function (bundleName, config) {
            if (config.affinity === 'client') {
                return true;
            }
            return false;
        };

        loaderData = plugin.getLoaderData('photonews', filter);

        A.isNotUndefined(loaderData, 'wrong loaderData');
        A.isNotUndefined(loaderData.json, 'wrong loaderData.json');

        json = loaderData.json;
        // console.log(loaderData);
        // console.log(json);
        // { 'news-model': { affinity: 'client', group: 'photonews', requires:
        // [Object] } }
        // A.areEqual('client', json.affinity, 'wrong affinity');
        A.areEqual('photonews', json['news-model'].group, 'wrong group');
        A.isNotUndefined(json['news-model'].requires, 'missing "requires"');
        A.areEqual(1, json['news-model'].requires.length, 'wrong # of modules in "requires"');
        A.areEqual('model', json['news-model'].requires[0], 'wrong required module');
    },

    "test plugin without any modules registered": function () {
        var plugin = new PluginClass(),
            api = YUITest.Mock();

        YUITest.Mock.expect(api, {
            method: 'getBundleFiles',
            args: ['foo', YUITest.Mock.Value.Object],
            run: function (bundleName, filters) {
                return [];
            }
        });
        A.isUndefined(plugin.bundleUpdated({
            bundle: {
                name: 'foo',
                buildDirectory: __dirname
            }
        }, api));
        YUITest.Mock.verify(api);
    },

    "test plugin with filter": function () {
        var filterObj,
            plugin,
            api;
            
        filterObj = YUITest.Mock();
        YUITest.Mock.expect(filterObj, {
            method: 'filter',
            callCount: 3,
            args: [YUITest.Mock.Value.Object, YUITest.Mock.Value.String],
            run: function (bundle, relativePath) {
                A.areEqual('foo', bundle.name, 'bundle object should be provided');
                return relativePath === 'bar.js'; // denying all except bar.js
            }
        });
        plugin = new PluginClass({
            filter: filterObj.filter
        });
        api = YUITest.Mock();

        YUITest.Mock.expect(api, {
            method: 'getBundleFiles',
            args: [YUITest.Mock.Value.String, YUITest.Mock.Value.Object],
            run: function (bundleName, filters) {
                A.areEqual('foo', bundleName, 'wrong bundle name');
                return [];
            }
        });
        YUITest.Mock.expect(plugin, {
            method: '_buildsInBundle',
            args: [YUITest.Mock.Value.Object, YUITest.Mock.Value.Any, YUITest.Mock.Value.Any],
            run: function (bundle, modifiedFiles) {
                A.areEqual('foo', bundle.name, 'wrong bundle name');
                A.areSame(1, modifiedFiles.length, 'only bar.js shuould pass the filter');
                A.areSame(__dirname + '/bar.js', modifiedFiles[0], 'fullpath for bar.js should be produced');
                return [];
            }
        });
        A.isUndefined(plugin.bundleUpdated({
            bundle: {
                name: 'foo',
                buildDirectory: __dirname
            },
            files: {
                'bar.js': { fullPath: __dirname + '/bar.js', relativePath: 'bar.js' },
                'baz.js': { fullPath: __dirname + '/baz.js', relativePath: 'baz.js' },
                'path/to/something.js': { fullPath: __dirname + '/path/to/something.js', relativePath: 'path/to/something.js' }
            }
        }, api), 'all files should be filtered out');
        YUITest.Mock.verify(filterObj);
        YUITest.Mock.verify(api);
        YUITest.Mock.verify(plugin);
    },

    "test generateServerData": function () {
        var plugin = new PluginClass({}),
            fn;

        YUITest.Mock.expect(plugin, {
            method: 'getLoaderData',
            args: ['foo', YUITest.Mock.Value.Function],
            run: function (bundleName, fn) {
                A.areEqual(2, fn.length, 'wrong # of args');
                A.areEqual(true, fn('foo', { affinity: 'foo' }), 'wrong affinity');
                return { foo: 'bar' };
            }
        });
        fn = plugin.generateServerDataFactory({
            name: 'foo'
        });
        
        fn(function (data) {
            OA.areEqual({ foo: 'bar' }, data, 'wrong data returned');
        });

        A.areEqual('generateServerData', fn.name, 'wrong function name');
        YUITest.Mock.verify(plugin);
    },

    "test generateClientData": function () {
        var plugin,
            fn;

        plugin = new PluginClass({});
        YUITest.Mock.expect(plugin, {
            method: 'getLoaderData',
            args: [ 'foo', YUITest.Mock.Value.Function ],
            run: function (bundleName, fn) {
                A.areEqual('foo', bundleName, 'wrong bundle name');
                var isClient = fn('foo', { affinity: 'client' });
                A.areEqual(true, isClient, 'wrong affnity');

                return {
                    foo: 'bar',
                    json: { bar: 'baz' }
                };
            }
        });
        fn = plugin.generateClientDataFactory({name: 'foo' }, 'loader-foo');
        fn(function (data) {
            A.isNotUndefined(data);
            A.areEqual('baz', data.json.bar);
            A.isNotUndefined(data.json['loader-foo']);
            A.areEqual('foo', data.json['loader-foo'].group, 'wrong group name');
            A.areEqual('client', data.json['loader-foo'].affinity, 'wrong affnity');
        });
        YUITest.Mock.verify(plugin);
    },

    "test shiftEverything": function () {
        var plugin,
            fn,
            shifter;

        shifter = YUITest.Mock();
        YUITest.Mock.expect(shifter, {
            method: 'shiftFiles',
            args: [YUITest.Mock.Value.Any,
                    YUITest.Mock.Value.Object,
                    YUITest.Mock.Value.Function],
            run: function (builds, options, cb) {
                A.areEqual('bar.js', builds[0], 'wrong file in builds');
                A.areEqual('/tmp', options.buildDir, 'wrong buildDir');
                A.areEqual(true, options.cache, 'cache should be defined');
                // A.areEqual(true, options.args.indexOf('--cssproc')
                A.isTrue(options.args.indexOf('--no-global-config') > -1, 'missing --no-global-config');
                A.isTrue(options.args.indexOf('--no-coverage') > -1, 'missing --no-coverage');
                A.isTrue(options.args.indexOf('--no-lint') > -1, 'missing --no-lint');
                A.isTrue(options.args.indexOf('--cssproc') > -1, 'missing --cssproc');
                cb(); // no error
            }
        });

        plugin = new PluginClass({});
        fn = plugin.shiftEverythingFactory({
            name: 'foo',
            buildDirectory: '/tmp'
        }, 'assets', ['bar.js'], shifter);

        fn(function (data) {
            A.isUndefined(data, 'data should be undefined');
        });

        YUITest.Mock.verify(plugin);
    },
    "test shiftEverything when shiftFiles throws error": function () {
        var plugin,
            fn,
            shifter,
            hasError = false;

        shifter = YUITest.Mock();
        YUITest.Mock.expect(shifter, {
            method: 'shiftFiles',
            args: [YUITest.Mock.Value.Any,
                    YUITest.Mock.Value.Object,
                    YUITest.Mock.Value.Function],
            run: function (builds, options, cb) {
                cb(new Error('fake error'));
            }
        });

        plugin = new PluginClass({});
        fn = plugin.shiftEverythingFactory({
            name: 'foo',
            buildDirectory: '/tmp'
        }, 'assets', ['bar.js'], shifter);

        fn(null, function (err) {
            hasError = true;
            A.isNotUndefined(err, 'expecting error object');
        });

        YUITest.Mock.verify(plugin);
        A.areEqual(true, hasError, 'expected error handler to be called');
    },

    "test attachClientData": function () {
        var plugin,
            api,
            path,
            fn;

        plugin = new PluginClass({});
        api = YUITest.Mock();
        path = '/tmp';

        YUITest.Mock.expect(api, {
            method: 'writeFileInBundle',
            args: [YUITest.Mock.Value.String,
                    YUITest.Mock.Value.String,
                    YUITest.Mock.Value.Object],
            run: function (bundleName, dstpath, data) {
                A.areEqual('foo', bundleName, 'wrong bundleName');
                A.areEqual('/tmp', dstpath, 'wrong dstpath');
                OA.areEqual({bar: 'baz'}, data, 'wrong data');
            }
        });

        fn = plugin.attachClientDataFactory({name: 'foo'}, api, path);
        fn({json: 'bar', js: {bar: 'baz'}});

        YUITest.Mock.verify(api);
        A.areEqual(1, fn.length, 'wrong # of args');
    },

    "test attachServerData": function () {
        var plugin,
            fn,
            bundle = {name: 'foo'};
        plugin = new PluginClass({});
        fn = plugin.attachServerDataFactory(bundle);
        fn({ foo: 'bar', json: { bar: 'baz' }});

        A.isNotUndefined(bundle.yui);
        A.isNotUndefined(bundle.yui.server);
        OA.areEqual({bar: 'baz'}, bundle.yui.server, 'wrong loaderData.json value');
    },

    "test plugin flow with register and attach": function () {
        var plugin = new PluginClass({}),
            api = YUITest.Mock(),
            bundle = {
                name: 'foo',
                buildDirectory: '/path/to/foo-a.b.c'
            };

        plugin._bundles = {
            'foo': {
                'bar.js': {
                    'buildfile': 'bar.js',
                    builds: {
                        'foo-bar': {
                            config: { requires: [ ] },
                            name: 'foo-bar'
                        }
                    }
                }
            }
        };

        YUITest.Mock.expect(api, {
            method: 'getBundleFiles',
            args: ['foo', YUITest.Mock.Value.Object],
            run: function (bundleName, filters) {
                return ['bar.js', 'baz.js', 'path/to/build.json'];
            }
        });
        YUITest.Mock.expect(plugin, {
            method: 'generateServerDataFactory',
            args: [YUITest.Mock.Value.Object],
            run: function (bundle) {
                return function generateServerData() { };
            }
        });
        YUITest.Mock.expect(plugin, {
            method: 'generateClientDataFactory',
            args: [YUITest.Mock.Value.Object],
            run: function (bundle) {
                return function generateClientData() { };
            }
        });
        YUITest.Mock.expect(plugin, {
            method: 'shiftEverythingFactory',
            // function (bundle, cssproc, builds, shifter)
            args: [YUITest.Mock.Value.Object, YUITest.Mock.Value.Any, YUITest.Mock.Value.Any, YUITest.Mock.Value.Object],
            run: function () {
                return function shiftEverything() { };
            }
        });
        YUITest.Mock.expect(plugin, {
            method: 'attachServerDataFactory',
            args: [YUITest.Mock.Value.Object],
            run: function () {
                return function attachServerData() { };
            }
        });
        YUITest.Mock.expect(plugin, {
            method: 'attachClientDataFactory',
            args: [YUITest.Mock.Value.Object],
            run: function () {
                return function () {
                    return function attachClientData() {
                    };
                };
            }
        });
        YUITest.Mock.expect(api, {
            method: 'promise',
            args: [YUITest.Mock.Value.Function],
            callCount: 2,
            run: function (fn) {
                if (fn.name === 'generateServerData') {
                    return {
                        then: function (fn) {
                            A.areEqual('attachServerData', fn.name, 'wrong function');
                            return {
                                then: function (fn) {
                                    // fn is anonymous
                                    // var p = fn();
                                    // A.areEqual(promise, p, 'should be a promise');
                                    return {
                                        then: function (fn) {
                                            A.areEqual('attachClientData', fn.name, 'wrong function');
                                            return {
                                                then: function (fn) {
                                                    // fn == function (newfile)
                                                    return {
                                                        then: function (fn) {
                                                            // fn == anynmous,
                                                            var p = fn();
                                                            A.areEqual('api.promise(shiftEverything)', p, 'wrong promise');
                                                        }
                                                    };
                                                }
                                            }
                                        }
                                    };
                                }
                            };
                        }
                    };
                } else if (fn.name === 'shiftEverything') {
                    return 'api.promise(shiftEverything)';
                }

                A.isTrue(false, 'wrong function passed to api.promise');
            }
        });
        YUITest.Mock.expect(mockShifter, {
            method: '_checkYUIModule',
            callCount: 3,
            args: [YUITest.Mock.Value.String],
            run: function () {
                return '_checkYUIModule result';
            }
        });
        YUITest.Mock.expect(mockShifter, {
            method: '_checkBuildFile',
            callCount: 1,
            args: [YUITest.Mock.Value.String],
            run: function () {
                return '_checkBuildFile result';
            }
        });
        YUITest.Mock.expect(plugin, {
            method: '_buildsInBundle',
            args: [YUITest.Mock.Value.Object, YUITest.Mock.Value.Any, YUITest.Mock.Value.Any],
            run: function (bundle, modifiedFiles) {
                return ['bar.js'];
            }
        });
        YUITest.Mock.expect(plugin, {
            method: 'register',
            callCount: 0,
            args: ['foo', '/path/to/foo-a.b.c', __filename]
        });
        YUITest.Mock.expect(mockShifter, {
            method: 'shiftFiles',
            args: [YUITest.Mock.Value.Any, YUITest.Mock.Value.Object, YUITest.Mock.Value.Function],
            run: function (files, options, callback) {
                callback();
            }
        });
        plugin.bundleUpdated({
            bundle: bundle,
            files: {
                'bar.js': { fullPath: 'bar.js' },
                'baz.js': { fullPath: 'baz.js' },
                'path/to/something.js': { fullPath: 'path/to/something.js' }
            }
        }, api);
        YUITest.Mock.verify(api);
        YUITest.Mock.verify(plugin);
    }
}));

YUITest.TestRunner.add(suite);