#!/bin/sh
nohup node ./node_modules/.bin/startSN peerid=SN_PEER_DBFT out_host=127.0.0.1 tcpPort=12405 udpPort=12406 2&>1 > snPeer.log &