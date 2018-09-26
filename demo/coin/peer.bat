node ./dist/blockchain-sdk/src/tool/host.js peer ^
--genesis "./data/coin/genesis" ^
--dataDir "./data/coin/peer" ^
--net tcp --host localhost --port 12313 --peers "localhost:12312" ^
--loggerConsole --loggerLevel debug