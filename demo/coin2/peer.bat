node ./dist/blockchain-sdk/src/tool/host.js peer ^
--genesis "./data/coin2/genesis" ^
--dataDir "./data/coin2/peer" ^
--net tcp --host localhost --port 12313 --peers "localhost:12312" ^
--loggerConsole --loggerLevel debug