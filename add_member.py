import urllib.request, json

# Step 1: Login as test2 to get token
data = json.dumps({"email":"test2@test.com","password":"password123"}).encode()
req = urllib.request.Request("http://127.0.0.1:8000/api/auth/login", data=data, headers={"Content-Type":"application/json"})
res = json.loads(urllib.request.urlopen(req).read().decode())
token = res["access_token"]
print("Login OK!")

# Step 2: Register user2
try:
    data2 = json.dumps({"email":"user2@test.com","username":"user2","full_name":"User Two","password":"password123"}).encode()
    req2 = urllib.request.Request("http://127.0.0.1:8000/api/auth/register", data=data2, headers={"Content-Type":"application/json"})
    res2 = json.loads(urllib.request.urlopen(req2).read().decode())
    user2_id = res2["user"]["id"]
    print("User2 registered! ID:", user2_id)
except Exception as e:
    # Already exists - login instead
    print("User2 already exists, logging in...")
    data2b = json.dumps({"email":"user2@test.com","password":"password123"}).encode()
    req2b = urllib.request.Request("http://127.0.0.1:8000/api/auth/login", data=data2b, headers={"Content-Type":"application/json"})
    res2b = json.loads(urllib.request.urlopen(req2b).read().decode())
    user2_id = res2b["user"]["id"]
    print("User2 ID:", user2_id)

# Step 3: Get the general channel id
req3 = urllib.request.Request("http://127.0.0.1:8000/api/projects/", headers={"Authorization":"Bearer "+token})
res3 = json.loads(urllib.request.urlopen(req3).read().decode())
project_id = res3[0]["id"]
print("Channel ID:", project_id)

# Step 4: Add user2 to the channel
req4 = urllib.request.Request(
    f"http://127.0.0.1:8000/api/projects/{project_id}/members/{user2_id}",
    data=b"",
    headers={"Content-Type":"application/json","Authorization":"Bearer "+token},
    method="POST"
)
res4 = json.loads(urllib.request.urlopen(req4).read().decode())
print("User2 added to channel!", res4)
print("")
print("Done! Now login as user2@test.com with password123 in a second browser tab!")
