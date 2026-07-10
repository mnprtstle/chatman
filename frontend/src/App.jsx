import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux';
import Login from './pages/login';
import { AuthLayout } from './components';
import Register from './pages/register';
import Messenger from './pages/messenger';
import { useEffect, useState } from 'react';
import SsoRedirect from './pages/ssoredirect';
import { checkUserCredentials } from './store/thunks';
import { history } from './utils';
import { LoadingCircle } from './components/LoadingCircle';

function App() {
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(true);
  history.navigate = useNavigate();

  useEffect(() => {
    setIsLoading(false);
    dispatch(checkUserCredentials());
  }, []);

  return (
    <>
      {!isLoading ? (
        <Routes>
          <Route
            path="/"
            element={
              <Navigate to="/login" />
            }
          />

          <Route
            path="/sso-redirect"
            element={
              <AuthLayout authentication={false}>
                <SsoRedirect />
              </AuthLayout>
            }
          />

          <Route
            path="/login"
            element={
              <AuthLayout authentication={false}>
                <Login />
              </AuthLayout>
            }
          />


          <Route
            path="/register"
            element={
              <AuthLayout authentication={false}>
                <Register />
              </AuthLayout>
            }
          />

          <Route
            path="/chats/*"
            element={
              <AuthLayout authentication>
                <Messenger />

              </AuthLayout>
            }
          />
          <Route
            path="/chats/profile"
            element={
              <AuthLayout authentication>
                <Messenger />
              </AuthLayout>
            }
          />
          <Route
            path="/chats/:chatId"
            element={
              <AuthLayout authentication>
                <Messenger />
              </AuthLayout>
            }
          />



        </Routes>
      ) : (
        <p>Loading...</p>
      )}
    </>
  )
}

export default App
