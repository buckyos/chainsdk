const gulp = require("gulp");
const ts = require("gulp-typescript");
const sourcemaps = require("gulp-sourcemaps");
const tsProject = ts.createProject("tsconfig.json");
const fs = require("fs-extra");

gulp.task("compile", function() {
    return tsProject.src()
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .js
        .pipe(sourcemaps.write())
        .pipe(gulp.dest("dist/blockchain-sdk"));
});

// 其他需要拷贝到dist目录的非代码文件,可以在这里加,调用npm run build会拷贝到dist
gulp.task("res", () => {
    [
        gulp.src(["./src/**/*.sql", "./src/**/*.js", "./src/**/*.d.ts", "./src/**/*.json"])
            .pipe(gulp.dest("./dist/blockchain-sdk/src")),
        gulp.src(["./test/**/*.sql", "./test/**/*.js", "./test/**/*.d.ts", "./test/**/*.json"])
            .pipe(gulp.dest("./dist/blockchain-sdk/src")),
        gulp.src(["./demo/**/*.json"])
            .pipe(gulp.dest("./dist/blockchain-sdk/demo")),
    ];
});

gulp.task("build", ["compile", "res"]);

gulp.task("_publish", () => {
    let pkg = fs.readJSONSync("./package.json");
    pkg.main = "./src/client/index.js";
    pkg.types = "./src/client/index.d.ts";
    pkg.repository.url = "https://github.com/buckyos/chainsdk";
    delete pkg.scripts;
    pkg.bin = {
        "chain_host": "./src/tool/host.js",
        "address_tool": "./src/tool/address.js",
        "chain_debuger": "./src/tool/debuger.js",
    };
    fs.ensureDirSync("./dist/blockchain-sdk/src/");
    fs.writeJSONSync("./dist/blockchain-sdk/package.json", pkg, {spaces: 4, flag: "w"});
});

gulp.task("publish", ["build", "_publish"]);
gulp.task("npm", () => {
    fs.removeSync("./dist/blockchain-sdk/test/");
    fs.removeSync("./dist/blockchain-sdk/demo/");
    fs.copySync("./LICENSE", "./dist/blockchain-sdk/LICENSE");
});
