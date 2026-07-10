import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom'

function AuthLayout({ children, authentication = true }) {
  const navigate = useNavigate();
  const [loader, setLoader] = useState(true);
  const authStatus = useSelector(state => state.auth.account);

  useEffect(() => {

    if (authentication && (!!authStatus !== authentication)) {
      navigate("/login");
    } else if (!authentication && (!!authStatus !== authentication)) {
      navigate("/chats");
    }
    setLoader(false);
  }, [authStatus, navigate, authentication]);

  if (loader || (
    authentication && (!!authStatus !== authentication)
  ) || (
      !authentication && (!!authStatus !== authentication)
    )) {

    return <h1>Loading...</h1>

  } else {

    return (
      <>
        {children}
      </>
    )
  }
}

export default AuthLayout
