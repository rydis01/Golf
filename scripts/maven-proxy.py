#!/usr/bin/env python3
"""Use the cloud's existing HTTP proxy without copying credentials."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree.ElementTree import Element, SubElement, ElementTree

root = Element('settings', xmlns='http://maven.apache.org/SETTINGS/1.2.0')
url = os.environ.get('HTTPS_PROXY') or os.environ.get('HTTP_PROXY')
if url:
    proxy_url = urlsplit(url)
    if proxy_url.scheme != 'http' or not proxy_url.hostname or proxy_url.username or proxy_url.password:
        raise SystemExit('Proxy requires unsupported authentication or protocol; configure Maven securely.')
    proxy = SubElement(SubElement(root, 'proxies'), 'proxy')
    for key, value in {'id': 'cloud-proxy', 'active': 'true', 'protocol': 'http', 'host': proxy_url.hostname,
                       'port': str(proxy_url.port or 80), 'nonProxyHosts': 'localhost|127.0.0.1'}.items():
        SubElement(proxy, key).text = value
Path('.tools').mkdir(exist_ok=True)
ElementTree(root).write('.tools/maven-settings.xml', encoding='UTF-8', xml_declaration=True)
