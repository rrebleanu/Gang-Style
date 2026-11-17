#!/usr/bin/env bash

echo -e "\033[1;36m TESTARE TASK 12: AUTENTIFICARE GANGSTYLE (BASH) ===\033[0m\n"

# 1. Login ADMIN
echo -n "1. Login ADMIN (admin@gangstyle.ro)... "
RES1=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@gangstyle.ro","password":"AdminPass123!"}')
HTTP_CODE1=$(echo "$RES1" | tail -n1)
BODY1=$(echo "$RES1" | sed '$d')

if [ "$HTTP_CODE1" -eq 200 ]; then
  echo -e "\033[1;32m[SUCCES 200]\033[0m"
  echo "   Răspuns: $BODY1" | head -c 120
  echo "..."
else
  echo -e "\033[1;31m[EROARE $HTTP_CODE1]\033[0m"
fi
echo ""

# 2. Login FRIZER Filip
echo -n "2. Login FRIZER Filip (filip@gangstyle.ro)... "
RES2=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d '{"email":"filip@gangstyle.ro","password":"FilipPass123!"}')
HTTP_CODE2=$(echo "$RES2" | tail -n1)
BODY2=$(echo "$RES2" | sed '$d')

if [ "$HTTP_CODE2" -eq 200 ]; then
  echo -e "\033[1;32m[SUCCES 200]\033[0m"
  echo "   Răspuns: $BODY2" | head -c 120
  echo "..."
else
  echo -e "\033[1;31m[EROARE $HTTP_CODE2]\033[0m"
fi
echo ""

# 3. Login CLIENT existent
echo -n "3. Login CLIENT (client@gangstyle.ro)... "
RES3=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d '{"email":"client@gangstyle.ro","password":"ClientPass123!"}')
HTTP_CODE3=$(echo "$RES3" | tail -n1)
BODY3=$(echo "$RES3" | sed '$d')

if [ "$HTTP_CODE3" -eq 200 ]; then
  echo -e "\033[1;32m[SUCCES 200]\033[0m"
  echo "   Răspuns: $BODY3" | head -c 120
  echo "..."
else
  echo -e "\033[1;31m[EROARE $HTTP_CODE3]\033[0m"
fi
echo ""

# 4. Parola gresita
echo -n "4. Login PAROLĂ GREȘITĂ (Securitate)... "
RES4=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@gangstyle.ro","password":"ParolaGresita"}')
HTTP_CODE4=$(echo "$RES4" | tail -n1)

if [ "$HTTP_CODE4" -eq 401 ]; then
  echo -e "\033[1;32m[SUCCES 401 conform așteptărilor]\033[0m"
else
  echo -e "\033[1;31m[EROARE $HTTP_CODE4]\033[0m"
fi
echo ""

# 5. Register client nou
RAND_NUM=$RANDOM
echo -n "5. Înregistrare CLIENT NOU... "
RES5=$(curl -s -w "\n%{http_code}" -X POST http://localhost:8080/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"client.${RAND_NUM}@example.com\",\"password\":\"ClientPass123!\",\"displayName\":\"Ion Client\",\"phone\":\"+40722111222\"}")
HTTP_CODE5=$(echo "$RES5" | tail -n1)
BODY5=$(echo "$RES5" | sed '$d')

if [ "$HTTP_CODE5" -eq 201 ]; then
  echo -e "\033[1;32m[SUCCES 201]\033[0m"
  echo "   Răspuns: $BODY5" | head -c 120
  echo "..."
else
  echo -e "\033[1;31m[EROARE $HTTP_CODE5]\033[0m"
fi
echo ""
