sed -i "s~%%ipaddress%%~$1~g" start.sh
sed -i "s~%%directory%%~$2~g" start.sh
sed -i "s~%%ipaddress%%~$1~g" client/index.js
sed -i "s~%%ipaddress%%~$1~g" server/__main__.py