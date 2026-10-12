package se.golf;

import java.net.InetSocketAddress;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

final class NetworkClients {
    static HttpClient create() {
        HttpClient.Builder builder = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8));
        String raw = System.getenv("HTTPS_PROXY");
        if (raw == null || raw.isBlank()) raw = System.getenv("HTTP_PROXY");
        if (raw != null && !raw.isBlank()) {
            URI proxy = URI.create(raw);
            if (!"http".equals(proxy.getScheme()) || proxy.getHost() == null || proxy.getUserInfo() != null) throw new IllegalStateException("Unsupported proxy configuration; use a supported HTTP proxy without embedded credentials.");
            builder.proxy(ProxySelector.of(new InetSocketAddress(proxy.getHost(), proxy.getPort() == -1 ? 80 : proxy.getPort())));
        }
        return builder.build();
    }
}
