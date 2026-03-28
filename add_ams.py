import urllib.request, json

# Login as test2 to get admin token
data = json.dumps({"email":"test2@test.com","password":"password123"}).encode()
req = urllib.request.Request("http://127.0.0.1:8000/api/auth/login", data=data, headers={"Content-Type":"application/json"})
res = json.loads(urllib.request.urlopen(req).read().decode())
token = res["access_token"]
print("Admin login OK!")

# Login as ams to get their user ID
data2 = json.dumps({"email":"ams@gmail.com","password":"ams21"}).encode()
req2 = urllib.request.Request("http://127.0.0.1:8000/api/auth/login", data=data2, headers={"Content-Type":"application/json"})
res2 = json.loads(urllib.request.urlopen(req2).read().decode())
ams_id = res2["user"]["id"]
print("ams user ID:", ams_id)

# Add ams to the general channel
project_id = "c1524f78-1a7d-4dbe-bbf3-40d858920d15"
url = "http://127.0.0.1:8000/api/projects/" + project_id + "/members/" + ams_id
req3 = urllib.request.Request(url, data=b"{}", headers={"Content-Type":"application/json","Authorization":"Bearer "+token}, method="POST")
res3 = json.loads(urllib.request.urlopen(req3).read().decode())
print("ams added to channel!", res3)
print("")
print("Done! Now refresh the browser tab where ams is logged in!")
