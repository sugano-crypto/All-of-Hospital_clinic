"""One-shot, read-only HTTPS/DNS diagnosis for this project only.

No secrets or environment variable values are printed. No retries, no bypass of
system proxies, no Supabase credentials, no external changes.
Run in the selected Codex cloud environment:
    python scripts/diagnose_connection.py
"""
import os
import socket
import ssl
import urllib.error
import urllib.request

HOSTS = (
    "kouseikyoku.mhlw.go.jp",
    "www.mhlw.go.jp",
    "leczxapskgixlzykdovz.supabase.co",
)


def reason_class(error):
    """Classify failures without printing proxy URLs, credentials or env values."""
    if isinstance(error, urllib.error.HTTPError):
        return f"HTTP_{error.code}_RESPONSE"
    reason = error.reason if isinstance(error, urllib.error.URLError) else error
    if isinstance(reason, socket.gaierror):
        return f"DNS_FAILURE_errno_{reason.errno}"
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return "TIMEOUT"
    if isinstance(reason, ssl.SSLError):
        return "TLS_ERROR"
    description = str(reason).lower()
    if "tunnel connection failed" in description or "connect tunnel failed" in description:
        if "403" in description:
            return "PROXY_CONNECT_TUNNEL_REJECTED_403"
        return "PROXY_CONNECT_TUNNEL_FAILED"
    if "proxy" in description and ("403" in description or "denied" in description):
        return "PROXY_POLICY_REJECTED"
    if "name resolution" in description or "nodename nor servname" in description:
        return "DNS_FAILURE"
    if isinstance(reason, ConnectionRefusedError):
        return "TCP_CONNECTION_REFUSED"
    if isinstance(reason, ConnectionResetError):
        return "TCP_CONNECTION_RESET"
    if isinstance(reason, OSError):
        return f"OS_ERROR_errno_{reason.errno}"
    return type(reason).__name__


def main():
    # Diagnostic metadata are booleans only; values are never logged.
    p = urllib.request.getproxies()
    print("TEST=Codex selected runtime (verify environment name and RUNNING in UI)")
    print("HTTPS_PROXY_CONFIGURED=", bool(p.get("https")))
    print("HTTP_PROXY_CONFIGURED=", bool(p.get("http")))
    print("PROXY_AUTH_OR_HOST_VALUES=NOT_DISPLAYED")
    print("RETRIES=0")
    print("ALLOWLIST_STATUS=CHECK_CLOUD_ENVIRONMENT_UI")
    for host in HOSTS:
        try:
            socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
            print(f"DNS {host} OK")
        except socket.gaierror as err:
            print(f"DNS {host} DNS_FAILURE_errno_{err.errno}")
        except Exception as err:
            print(f"DNS {host} {reason_class(err)}")
        try:
            req = urllib.request.Request(
                "https://" + host + "/",
                headers={"User-Agent": "MedicalFacilityNetworkDiagnostic/1.0"},
            )
            # Uses the runtime's default HTTPS proxy configuration.
            with urllib.request.urlopen(req, timeout=10) as response:
                print(f"HTTPS {host} HTTP_{response.status}_RESPONSE")
        except Exception as err:
            print(f"HTTPS {host} {reason_class(err)}")
    print("NOTE=HTTP_401/403_RESPONSE can prove HTTP reachability; "
          "PROXY_CONNECT_TUNNEL_REJECTED_403 is a different failure.")
    print("NOTE=Direct DNS failure alone does not prove proxied HTTPS is impossible.")


if __name__ == "__main__":
    main()
