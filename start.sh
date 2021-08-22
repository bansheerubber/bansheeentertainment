#!/bin/sh
python -m http.server --directory %%directory%%/client/ --bind %%ipaddress%% &
python -m server